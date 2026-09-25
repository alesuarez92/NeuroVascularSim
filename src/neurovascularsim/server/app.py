"""HTTP API for the web app (FastAPI).

The service is a thin layer over the engine: it lists plugins, describes
networks, validates and runs experiment specs, and stores runs. No science
lives here.

Run locally::

    pip install -e ".[server]"
    nvs serve    # or: uvicorn --factory neurovascularsim.server.app:create_app

Runs can be submitted as background jobs (``/api/jobs``, see jobs.py) or
run synchronously (``/api/runs``, for small networks and scripts).
"""

from __future__ import annotations

import math
import os
import re
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import numpy as np

from .. import __version__, registry
from ..experiment import ExperimentSpec, RunStore, run_experiment
from ..jobs import JobQueue
from ..vascular import io as vio
from ..vascular.stats import (
    JI_CAPILLARY_MAX_DIAMETER_UM,
    capillary_branch_order,
    contract_branches,
    network_statistics,
    tissue_vessel_distance,
)

DEFAULT_RUN_DIR = os.environ.get("NVS_RUN_DIR", "runs")
DEFAULT_WORKERS = int(os.environ.get("NVS_WORKERS", "1"))
MAX_UPLOAD_BYTES = 512 * 2**20
# The built web app (web/dist in a source checkout), served at "/" if present.
DEFAULT_WEB_DIR = os.environ.get("NVS_WEB_DIR", str(Path(__file__).resolve().parents[3] / "web" / "dist"))


class NetworkRequest(BaseModel):
    name: str
    params: dict[str, Any] = {}


def _finite(x):
    """NaN and infinities (undefined statistics) as null, which JSON allows."""
    if isinstance(x, dict):
        return {k: _finite(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_finite(v) for v in x]
    if isinstance(x, float) and not math.isfinite(x):
        return None
    return x


def _plugin_info(kind: str, name: str) -> dict:
    p = registry.get(kind, name)
    return {
        "name": p.name,
        "description": p.description,
        "reference": p.reference,
        "parameters": p.parameters,
        "choices": p.choices,
    }


def create_app(run_dir: str = DEFAULT_RUN_DIR, web_dir: str | None = DEFAULT_WEB_DIR,
               workers: int = DEFAULT_WORKERS) -> FastAPI:
    store = RunStore(run_dir)
    jobs = JobQueue(store, workers=workers)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        jobs.shutdown()

    app = FastAPI(title="NeuroVascularSim", version=__version__, lifespan=lifespan)
    app.state.jobs = jobs
    # The front end may be served from another origin during development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("NVS_CORS_ORIGINS", "http://localhost:5173").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": __version__}

    @app.get("/api/plugins")
    def plugins():
        return {
            kind: {"contract": registry.KINDS[kind], "plugins": [_plugin_info(kind, n) for n in names]}
            for kind, names in registry.available().items()
        }

    @app.post("/api/networks")
    def network(req: NetworkRequest):
        try:
            case = registry.create("network", req.name, **req.params)
        except KeyError as e:
            raise HTTPException(404, str(e)) from None
        except (TypeError, ValueError) as e:
            raise HTTPException(422, str(e)) from None
        return {
            "graph": case.graph.to_dict(),
            "pressure_bc": {str(k): v for k, v in case.pressure_bc.items()},
            "inlet_hematocrit": case.inlet_hematocrit,
            "meta": case.meta,
        }

    @app.post("/api/networks/stats")
    def network_stats(req: NetworkRequest):
        """Morphometry and capillary topology, for comparison with measurements.

        Counted as the papers count: per branch (vessel between branch points),
        and capillaries are vessels at most 7 um wide (Ji et al. 2021).
        """
        try:
            case = registry.create("network", req.name, **req.params)
        except KeyError as e:
            raise HTTPException(404, str(e)) from None
        except (TypeError, ValueError) as e:
            raise HTTPException(422, str(e)) from None
        # Undefined values (no volume, an empty vessel class) come out as null.
        with np.errstate(all="ignore"), warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            branches = contract_branches(case.graph, JI_CAPILLARY_MAX_DIAMETER_UM)
            out = {
                "definitions": {"unit": "branch", "capillary_max_diameter_um": JI_CAPILLARY_MAX_DIAMETER_UM},
                "statistics": network_statistics(branches),
                "branch_order": capillary_branch_order(branches),
                "tissue_distance": tissue_vessel_distance(case.graph),
            }
        return _finite(out)

    @app.get("/api/data-files")
    def list_data_files():
        """CSV files available to the 'graph_files' network (the data directory)."""
        base = vio.DATA_DIR
        if not base.exists():
            return []
        return [{"name": p.name, "size": p.stat().st_size} for p in sorted(base.glob("*.csv"))]

    @app.put("/api/data-files/{name}", status_code=201)
    async def upload_data_file(name: str, request: Request):
        """Store an uploaded CSV in the data directory (git-ignored, never committed)."""
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,120}\.csv", name) or name.startswith("."):
            raise HTTPException(422, "file name must be letters, digits, . _ - and end in .csv")
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"file larger than {MAX_UPLOAD_BYTES // 2**20} MB")
        body = await request.body()
        if len(body) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"file larger than {MAX_UPLOAD_BYTES // 2**20} MB")
        vio.DATA_DIR.mkdir(parents=True, exist_ok=True)
        (vio.DATA_DIR / name).write_bytes(body)
        return {"name": name, "size": len(body)}

    @app.post("/api/experiments/validate")
    def validate(spec: dict):
        try:
            ExperimentSpec.from_dict(spec).validate()
        except (KeyError, TypeError, ValueError) as e:
            return {"valid": False, "error": str(e)}
        return {"valid": True}

    @app.post("/api/runs", status_code=201)
    def create_run(spec: dict):
        try:
            parsed = ExperimentSpec.from_dict(spec)
            record = run_experiment(parsed)
        except (KeyError, TypeError, ValueError, IndexError) as e:
            raise HTTPException(422, str(e)) from None
        store.save(record)
        return record.to_dict()

    @app.post("/api/jobs", status_code=202)
    def submit_job(spec: dict):
        """Queue a run; poll GET /api/jobs/{id} for progress and the run id."""
        try:
            return jobs.submit(ExperimentSpec.from_dict(spec)).to_dict()
        except (KeyError, TypeError, ValueError, IndexError) as e:
            raise HTTPException(422, str(e)) from None

    @app.get("/api/jobs")
    def list_jobs():
        return [j.to_dict() for j in jobs.list()]

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str):
        try:
            return jobs.get(job_id).to_dict()
        except KeyError:
            raise HTTPException(404, f"no job {job_id}") from None

    @app.delete("/api/jobs/{job_id}")
    def cancel_job(job_id: str):
        try:
            return jobs.cancel(job_id).to_dict()
        except KeyError:
            raise HTTPException(404, f"no job {job_id}") from None

    @app.get("/api/runs")
    def list_runs():
        return store.list()

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str):
        try:
            return store.load(run_id)
        except KeyError:
            raise HTTPException(404, f"no run {run_id}") from None

    # Mounted last so the API routes above take precedence.
    if web_dir and (Path(web_dir) / "index.html").exists():
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")

    return app
