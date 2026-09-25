"""HTTP API for the web app (FastAPI).

The service is a thin layer over the engine: it lists plugins, describes
networks, validates and runs experiment specs, and stores runs. No science
lives here.

Run locally::

    pip install -e ".[server]"
    nvs serve    # or: uvicorn --factory neurovascularsim.server.app:create_app

Runs execute synchronously for now (small networks). A job queue for
large networks comes with the realistic 3D graphs.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import __version__, registry
from ..experiment import ExperimentSpec, RunStore, run_experiment

DEFAULT_RUN_DIR = os.environ.get("NVS_RUN_DIR", "runs")
# The built web app (web/dist in a source checkout), served at "/" if present.
DEFAULT_WEB_DIR = os.environ.get("NVS_WEB_DIR", str(Path(__file__).resolve().parents[3] / "web" / "dist"))


class NetworkRequest(BaseModel):
    name: str
    params: dict[str, Any] = {}


def _plugin_info(kind: str, name: str) -> dict:
    p = registry.get(kind, name)
    return {
        "name": p.name,
        "description": p.description,
        "reference": p.reference,
        "parameters": p.parameters,
    }


def create_app(run_dir: str = DEFAULT_RUN_DIR, web_dir: str | None = DEFAULT_WEB_DIR) -> FastAPI:
    app = FastAPI(title="NeuroVascularSim", version=__version__)
    # The front end may be served from another origin during development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("NVS_CORS_ORIGINS", "http://localhost:5173").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    store = RunStore(run_dir)

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
