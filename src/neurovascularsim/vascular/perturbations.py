"""Perturbations: changes applied to a network before solving (plugins)."""

from __future__ import annotations

from dataclasses import replace

import numpy as np

from .. import registry
from .graph import VesselType
from .networks import NetworkCase


def _select_edges(case: NetworkCase, edges=None, vessel_types=None, depth_range_um=None,
                  layers=None) -> np.ndarray:
    """Edge indices from explicit indices, metadata keys, or vessel types,
    optionally restricted to a depth range (um) or cortical layers (1..5).

    ``edges`` may mix integers and names of integer entries in ``case.meta``
    (e.g. ``"active_edge"``). Depth and layer filters apply to the edge
    midpoint and need a graph with depth information.
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
    g = case.graph
    if not edges and not vessel_types and (depth_range_um is not None or layers):
        selected = list(range(g.n_edges))
    idx = np.unique(np.asarray(selected, dtype=np.int64))
    if depth_range_um is not None or layers:
        if g.depth is None:
            raise ValueError("depth or layer selection needs a network with cortical depth")
        mid_um = 0.5 * (g.depth[g.edges[idx, 0]] + g.depth[g.edges[idx, 1]]) / 1e-6
        keep = np.ones(idx.size, dtype=bool)
        if depth_range_um is not None:
            lo, hi = depth_range_um
            keep &= (mid_um >= lo) & (mid_um <= hi)
        if layers:
            if g.layer is None:
                raise ValueError("layer selection needs a network with layer labels")
            keep &= np.isin(g.layer[g.edges[idx, 0]], list(layers))
        idx = idx[keep]
    if idx.size == 0:
        raise ValueError("perturbation selects no edges")
    if idx.min() < 0 or idx.max() >= case.graph.n_edges:
        raise IndexError("perturbation refers to an edge that does not exist")
    return idx


@registry.register(
    "perturbation",
    "scale_diameter",
    description="Multiply the diameter of selected vessels (dilation > 1, constriction < 1).",
    parameters={"edges": [], "vessel_types": [], "depth_range_um": None, "layers": [], "factor": 1.3},
)
def scale_diameter(edges=None, vessel_types=None, factor: float = 1.3, depth_range_um=None, layers=None):
    if factor <= 0:
        raise ValueError("factor must be positive")

    def apply(case: NetworkCase) -> NetworkCase:
        idx = _select_edges(case, edges, vessel_types, depth_range_um, layers)
        d = case.graph.diameter.copy()
        d[idx] *= factor
        return replace(case, graph=case.graph.with_diameter(d), meta=dict(case.meta))

    return apply
