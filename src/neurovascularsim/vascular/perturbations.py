"""Perturbations: changes applied to a network before solving (plugins)."""

from __future__ import annotations

from dataclasses import replace

import numpy as np

from .. import registry
from .graph import VesselType
from .networks import NetworkCase


def _select_edges(case: NetworkCase, edges=None, vessel_types=None) -> np.ndarray:
    """Edge indices from explicit indices, metadata keys, or vessel types.

    ``edges`` may mix integers and names of integer entries in ``case.meta``
    (e.g. ``"active_edge"``).
    """
    selected: list[int] = []
    for e in edges or []:
        if isinstance(e, str):
            value = case.meta.get(e)
            if value is None:
                raise KeyError(f"network has no metadata entry {e!r}")
            selected.extend(np.atleast_1d(value).astype(int).tolist())
        else:
            selected.append(int(e))
    if vessel_types:
        codes = [VesselType[t].value if isinstance(t, str) else int(t) for t in vessel_types]
        selected.extend(np.flatnonzero(np.isin(case.graph.vessel_type, codes)).tolist())
    idx = np.unique(np.asarray(selected, dtype=np.int64))
    if idx.size == 0:
        raise ValueError("perturbation selects no edges")
    if idx.min() < 0 or idx.max() >= case.graph.n_edges:
        raise IndexError("perturbation refers to an edge that does not exist")
    return idx


@registry.register(
    "perturbation",
    "scale_diameter",
    description="Multiply the diameter of selected vessels (dilation > 1, constriction < 1).",
    parameters={"edges": [], "vessel_types": [], "factor": 1.3},
)
def scale_diameter(edges=None, vessel_types=None, factor: float = 1.3):
    if factor <= 0:
        raise ValueError("factor must be positive")

    def apply(case: NetworkCase) -> NetworkCase:
        idx = _select_edges(case, edges, vessel_types)
        d = case.graph.diameter.copy()
        d[idx] *= factor
        return replace(case, graph=case.graph.with_diameter(d), meta=dict(case.meta))

    return apply
