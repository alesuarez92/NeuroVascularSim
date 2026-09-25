"""Morphometric and flow statistics of a vascular graph, for comparison with
published measurements (e.g. Blinder et al. 2013; Ji et al. 2021)."""

from __future__ import annotations

import numpy as np

from .graph import VascularGraph, VesselType

CLASSES = {
    "arterial": (VesselType.PIAL_ARTERY, VesselType.PENETRATING_ARTERIOLE,
                 VesselType.PRECAPILLARY_ARTERIOLE, VesselType.ARTERIOLE),
    "capillary": (VesselType.CAPILLARY,),
    "venous": (VesselType.VENULE, VesselType.ASCENDING_VENULE, VesselType.PIAL_VEIN),
}


def _summary(values_um: np.ndarray) -> dict:
    if values_um.size == 0:
        return {"n": 0}
    return {
        "n": int(values_um.size),
        "median": float(np.median(values_um)),
        "mean": float(values_um.mean()),
        "p10": float(np.percentile(values_um, 10)),
        "p90": float(np.percentile(values_um, 90)),
    }


def network_statistics(graph: VascularGraph, volume_mm3: float | None = None) -> dict:
    """Counts, lengths, diameters, length and volume densities, degrees.

    Lengths and diameters are in micrometres; length density in m/mm^3.
    ``volume_mm3`` defaults to ``graph.meta['volume_mm3']`` or the bounding box.
    """
    if volume_mm3 is None:
        volume_mm3 = graph.meta.get("volume_mm3")
    if volume_mm3 is None:
        span = graph.positions.max(axis=0) - graph.positions.min(axis=0)
        volume_mm3 = float(np.prod(span) * 1e9)
    length_um = graph.length * 1e6
    diameter_um = graph.diameter * 1e6
    vessel_volume_mm3 = np.pi * (graph.diameter / 2) ** 2 * graph.length * 1e9

    out = {"volume_mm3": volume_mm3, "n_nodes": graph.n_nodes, "n_edges": graph.n_edges}
    for name, types in CLASSES.items():
        m = np.isin(graph.vessel_type, types)
        out[name] = {
            "length_um": _summary(length_um[m]),
            "diameter_um": _summary(diameter_um[m]),
            "length_density_m_per_mm3": float(length_um[m].sum() * 1e-6 / volume_mm3),
            "volume_fraction": float(vessel_volume_mm3[m].sum() / volume_mm3),
        }
    out["vascular_volume_fraction"] = float(vessel_volume_mm3.sum() / volume_mm3)
    deg = np.bincount(graph.edges.ravel(), minlength=graph.n_nodes)
    out["degree_fractions"] = {int(k): float(v) for k, v in enumerate(np.bincount(deg) / graph.n_nodes) if v > 0}

    if graph.layer is not None and "layer_bounds_um" in graph.meta:
        bounds = graph.meta["layer_bounds_um"]
        names = graph.meta.get("layer_names", [f"layer {i}" for i in range(1, len(bounds))])
        cap = np.isin(graph.vessel_type, CLASSES["capillary"])
        mid_depth_um = 0.5 * (graph.depth[graph.edges[:, 0]] + graph.depth[graph.edges[:, 1]]) * 1e6
        area_mm2 = volume_mm3 / ((bounds[-1] - bounds[0]) * 1e-3)
        per_layer = {}
        for i, name in enumerate(names):
            m = cap & (mid_depth_um >= bounds[i]) & (mid_depth_um < bounds[i + 1])
            layer_volume = area_mm2 * (bounds[i + 1] - bounds[i]) * 1e-3
            per_layer[name] = float(length_um[m].sum() * 1e-6 / layer_volume)
        out["capillary_length_density_by_layer"] = per_layer
    return out


def capillary_branch_order(graph: VascularGraph) -> dict:
    """Topological distance of capillaries from arterial and venous vessels.

    A capillary edge's branch order is 1 + the smallest number of capillary
    edges between it and a non-capillary vessel on that side. Compare with
    Ji et al. 2021: mean capillary branch order 3.4 ± 0.2 and ~7 branches on
    the shortest path from penetrating arterioles to venules.
    """
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra

    cap = np.isin(graph.vessel_type, CLASSES["capillary"])
    e = graph.edges[cap]
    n = graph.n_nodes

    def distance_from(types) -> np.ndarray:
        src = np.unique(graph.edges[np.isin(graph.vessel_type, types)].ravel())
        # A super-source (node n) joined to every source node by a unit edge.
        rows = np.concatenate([e[:, 0], np.full(src.size, n)])
        cols = np.concatenate([e[:, 1], src])
        adj = coo_matrix((np.ones(rows.size), (rows, cols)), shape=(n + 1, n + 1))
        return dijkstra(adj, directed=False, indices=n)[:n] - 1.0

    da = distance_from(CLASSES["arterial"])
    dv = distance_from(CLASSES["venous"])
    order_a = 1 + np.minimum(da[e[:, 0]], da[e[:, 1]])
    order_v = 1 + np.minimum(dv[e[:, 0]], dv[e[:, 1]])
    nearest = np.minimum(order_a, order_v)
    venous_nodes = np.unique(graph.edges[np.isin(graph.vessel_type, CLASSES["venous"])].ravel())
    a_to_v = da[venous_nodes]
    a_to_v = a_to_v[np.isfinite(a_to_v) & (a_to_v > 0)]
    fin = np.isfinite
    return {
        "mean_order_from_arterial": float(order_a[fin(order_a)].mean()),
        "mean_order_from_venous": float(order_v[fin(order_v)].mean()),
        "mean_order_nearest": float(nearest[fin(nearest)].mean()),
        "median_arterial_to_venous_path": float(np.median(a_to_v)) if a_to_v.size else float("nan"),
    }
