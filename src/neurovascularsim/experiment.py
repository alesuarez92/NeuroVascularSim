"""Experiments as data, and runs with provenance.

An :class:`ExperimentSpec` says *what* to simulate: which network, which
solver options, and which conditions (sets of perturbations) to compare
with the baseline. It is plain JSON, so the web app edits it, runs can be
shared, and every result can be reproduced from its spec and code version.

:func:`run_experiment` executes a spec and returns a :class:`RunRecord`
with results and provenance.
"""

from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np
import scipy

from . import registry
from .vascular.flow import solve_flow

SPEC_VERSION = 1
SOLVER_OPTIONS = {"viscosity", "phase_separation", "tol", "max_iter", "relaxation"}


@dataclass
class Component:
    """A plugin reference: its name plus keyword parameters."""

    name: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Condition:
    """A labelled set of perturbations, compared against the baseline."""

    label: str
    perturbations: list[Component] = field(default_factory=list)


@dataclass
class ExperimentSpec:
    name: str
    network: Component
    conditions: list[Condition] = field(default_factory=list)
    solver: dict[str, Any] = field(default_factory=dict)
    description: str = ""
    # Optional models run after flow: parameters of OxygenParams / BoldParams
    # (an empty dict runs the model with its defaults; None skips it).
    oxygen: dict[str, Any] | None = None
    bold: dict[str, Any] | None = None
    spec_version: int = SPEC_VERSION

    # -- serialisation ---------------------------------------------------
    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "ExperimentSpec":
        d = dict(d)
        version = d.get("spec_version", SPEC_VERSION)
        if version != SPEC_VERSION:
            raise ValueError(f"unsupported spec_version {version}; expected {SPEC_VERSION}")
        return cls(
            name=d["name"],
            network=Component(**d["network"]),
            conditions=[
                Condition(c["label"], [Component(**p) for p in c.get("perturbations", [])])
                for c in d.get("conditions", [])
            ],
            solver=dict(d.get("solver", {})),
            description=d.get("description", ""),
            oxygen=None if d.get("oxygen") is None else dict(d["oxygen"]),
            bold=None if d.get("bold") is None else dict(d["bold"]),
        )

    @classmethod
    def from_json(cls, text: str) -> "ExperimentSpec":
        return cls.from_dict(json.loads(text))

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, sort_keys=True)

    def digest(self) -> str:
        """Content hash: identical specs have identical digests."""
        canonical = json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()

    # -- checks ------------------------------------------------------------
    def validate(self) -> None:
        """Raise if any referenced plugin or option does not exist."""
        registry.get("network", self.network.name)
        unknown = set(self.solver) - SOLVER_OPTIONS
        if unknown:
            raise ValueError(f"unknown solver options {sorted(unknown)}; allowed: {sorted(SOLVER_OPTIONS)}")
        for kind in ("viscosity", "phase_separation"):
            if kind in self.solver:
                registry.get(kind, self.solver[kind])
        labels = [c.label for c in self.conditions]
        if "baseline" in labels or len(labels) != len(set(labels)):
            raise ValueError("condition labels must be unique and not 'baseline'")
        for c in self.conditions:
            for p in c.perturbations:
                registry.get("perturbation", p.name)
        from .vascular.bold import BoldParams
        from .vascular.oxygen import OxygenParams

        for key, model in (("oxygen", OxygenParams), ("bold", BoldParams)):
            opts = getattr(self, key)
            if opts is not None:
                unknown = set(opts) - set(model.__dataclass_fields__)
                if unknown:
                    raise ValueError(f"unknown {key} options {sorted(unknown)}; allowed: {sorted(model.__dataclass_fields__)}")
        if self.bold is not None and self.oxygen is None:
            raise ValueError("the BOLD model needs the oxygen model (set 'oxygen', e.g. to {})")


@dataclass
class RunRecord:
    id: str
    spec: dict
    created: str
    provenance: dict
    results: dict  # label -> fields on the graph (lists)
    summary: dict  # label -> relative changes vs baseline

    def to_dict(self) -> dict:
        return asdict(self)


def _git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode != 0:
            return None
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def provenance(spec: ExperimentSpec) -> dict:
    from . import __version__

    return {
        "neurovascularsim": __version__,
        "git_commit": _git_commit(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "platform": platform.platform(),
        "spec_digest": spec.digest(),
    }


def _fields(sol) -> dict:
    return {
        "pressure": sol.pressure.tolist(),
        "flow": sol.flow.tolist(),
        "hematocrit": sol.hematocrit.tolist(),
        "viscosity": sol.viscosity.tolist(),
        "diameter": None,  # filled by caller
        "iterations": sol.iterations,
        "converged": bool(sol.converged),
    }


def _inlet_nodes(case, sol) -> list[int]:
    """Where arterial blood enters: the network's sources, else pressure nodes with outflow."""
    if case.meta.get("sources"):
        return list(case.meta["sources"])
    g = case.graph
    net = np.zeros(g.n_nodes)
    np.add.at(net, g.edges[:, 0], sol.flow)
    np.add.at(net, g.edges[:, 1], -sol.flow)
    return [n for n in case.pressure_bc if net[n] > 0]


def _tissue_slice(ox) -> dict:
    """The tissue PO2 plane through the middle of the column (x by depth), for display."""
    t = ox.tissue_po2
    mid = t.shape[1] // 2
    return {
        "po2_mmhg": np.round(t[:, mid, :].T, 1).tolist(),  # rows: z (depth), columns: x
        "voxel_um": float(ox.voxel / 1e-6),
        "origin_um": (ox.grid_origin / 1e-6).tolist(),
    }


def run_experiment(spec: ExperimentSpec, progress: Callable[[str, int, int], None] | None = None) -> RunRecord:
    """Solve the baseline and every condition, and summarise the changes.

    ``progress(stage, done, total)`` is called before each step (building the
    network, then each solve). It may raise to abort the run between steps.
    With ``spec.oxygen`` each solve includes oxygen transport, and with
    ``spec.bold`` each condition gets a laminar BOLD profile.
    """
    from .vascular.bold import BoldParams, bold_profile
    from .vascular.oxygen import OxygenParams, solve_oxygen

    spec.validate()
    total = 2 + len(spec.conditions)
    report = progress or (lambda stage, done, total: None)
    report("network", 0, total)
    base_case = registry.create("network", spec.network.name, **spec.network.params)
    solver = dict(spec.solver)
    oxygen = None if spec.oxygen is None else OxygenParams(**spec.oxygen)
    bold = None if spec.bold is None else BoldParams(**spec.bold)

    def solve(case):
        sol = solve_flow(case.graph, case.pressure_bc, inlet_hematocrit=case.inlet_hematocrit, **solver)
        out = _fields(sol)
        out["diameter"] = case.graph.diameter.tolist()
        if oxygen is not None:
            ox = solve_oxygen(case.graph, sol, oxygen, cmro2_scales=case.meta.get("cmro2_scales"),
                              inlet_nodes=_inlet_nodes(case, sol))
            out["po2"] = np.round(ox.po2, 3).tolist()
            out["so2"] = np.round(ox.so2, 5).tolist()
            out["oxygen"] = {k: v for k, v in ox.summary.items() if k != "change_history"}
            out["tissue_slice"] = _tissue_slice(ox)
        return sol, out

    report("baseline", 1, total)
    base_sol, base_out = solve(base_case)
    results = {"baseline": base_out}
    summary = {}
    for i, cond in enumerate(spec.conditions):
        report(cond.label, 2 + i, total)
        case = base_case
        for p in cond.perturbations:
            case = registry.create("perturbation", p.name, **p.params)(case)
        sol, out = solve(case)
        results[cond.label] = out
        with np.errstate(divide="ignore", invalid="ignore"):
            rel = np.where(base_sol.flow != 0, sol.flow / base_sol.flow, np.nan)
        summary[cond.label] = {
            "relative_flow": [None if not np.isfinite(x) else float(x) for x in rel],
            "hematocrit_change": (sol.hematocrit - base_sol.hematocrit).tolist(),
        }
        if bold is not None and base_case.graph.depth is not None:
            summary[cond.label]["bold"] = bold_profile(
                base_case.graph, base_out["diameter"], base_out["so2"], out["diameter"], out["so2"], bold)

    return RunRecord(
        id=uuid.uuid4().hex[:12],
        spec=spec.to_dict(),
        created=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        provenance=provenance(spec),
        results=results,
        summary=summary,
    )


class RunStore:
    """Runs saved as JSON files in a directory, one file per run."""

    def __init__(self, directory: str | Path):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, run_id: str) -> Path:
        if not run_id.isalnum():
            raise KeyError(run_id)
        return self.directory / f"{run_id}.json"

    def save(self, record: RunRecord) -> None:
        # Write then rename, so readers (e.g. list() while a job saves) never see a partial file.
        path = self._path(record.id)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(record.to_dict()))
        tmp.replace(path)

    def load(self, run_id: str) -> dict:
        path = self._path(run_id)
        if not path.exists():
            raise KeyError(run_id)
        return json.loads(path.read_text())

    def list(self) -> list[dict]:
        """Brief entries (id, name, created), newest first."""
        entries = []
        for path in self.directory.glob("*.json"):
            d = json.loads(path.read_text())
            entries.append({"id": d["id"], "name": d["spec"]["name"], "created": d["created"]})
        return sorted(entries, key=lambda e: e["created"], reverse=True)
