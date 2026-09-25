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
    chord = np.linalg.norm(graph.positions[graph.edges[:, 0]] - graph.positions[graph.edges[:, 1]], axis=1)
    tortuosity = graph.length / np.maximum(chord, 1e-12)

    out = {"volume_mm3": volume_mm3, "n_nodes": graph.n_nodes, "n_edges": graph.n_edges}
    for name, types in CLASSES.items():
        m = np.isin(graph.vessel_type, types)
        out[name] = {
            "length_um": _summary(length_um[m]),
            "diameter_um": _summary(diameter_um[m]),
            "length_density_m_per_mm3": float(length_um[m].sum() * 1e-6 / volume_mm3),
            "volume_fraction": float(vessel_volume_mm3[m].sum() / volume_mm3),
            # Path length over end-to-end distance (1 for straight vessels).
            "tortuosity_mean": float(tortuosity[m & (chord > 0)].mean()) if (m & (chord > 0)).any() else None,
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


def tissue_vessel_distance(graph: VascularGraph, n_samples: int = 20000, margin_um: float = 60.0,
                           min_depth_um: float = 100.0, seed: int = 0) -> dict | None:
    """Distance from tissue to the nearest vessel wall, in micrometres.

    Random points are sampled inside the network's bounding box (``margin_um``
    from its faces and, with depth, below ``min_depth_um``); points inside a
    lumen are not tissue and are skipped. Compare with Ji et al. 2021: mean
    13.3 +/- 1.2 um at 0.88 m/mm^3 in mouse vibrissa cortex. Returns None
    for networks too thin to sample (e.g. planar test networks).
    """
    from scipy.spatial import cKDTree

    pos = graph.positions / 1e-6
    lo, hi = pos.min(axis=0) + margin_um, pos.max(axis=0) - margin_um
    if graph.depth is not None:
        # The depth axis is the coordinate that tracks depth; the pia is at its min or max.
        depth = np.asarray(graph.depth)
        corr = [abs(np.corrcoef(pos[:, i], depth)[0, 1]) if np.ptp(pos[:, i]) > 0 else 0 for i in range(3)]
        axis = int(np.argmax(corr))
        if np.corrcoef(pos[:, axis], depth)[0, 1] > 0:
            lo[axis] = max(lo[axis], pos[:, axis].min() + min_depth_um)
        else:
            hi[axis] = min(hi[axis], pos[:, axis].max() - min_depth_um)
    if np.any(hi - lo <= 0):
        return None
    a, b = pos[graph.edges[:, 0]], pos[graph.edges[:, 1]]
    n = np.maximum(1, np.ceil(np.linalg.norm(b - a, axis=1))).astype(int)  # centreline samples ~1 um apart
    edge = np.repeat(np.arange(graph.n_edges), n)
    t = (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n) + 0.5) / np.repeat(n, n)
    points = a[edge] + (b[edge] - a[edge]) * t[:, None]
    radius = graph.diameter[edge] / 2e-6
    q = np.random.default_rng(seed).uniform(lo, hi, size=(n_samples, 3))
    k = min(16, len(points))
    dist, j = cKDTree(points).query(q, k=k)
    dist, j = dist.reshape(len(q), k), j.reshape(len(q), k)
    wall = np.min(dist - radius[j], axis=1)
    wall = wall[wall > 0]
    if wall.size == 0:
        return None
    return {
        "mean_um": float(wall.mean()),
        "median_um": float(np.median(wall)),
        "p99_um": float(np.percentile(wall, 99)),
    }


#: Ji et al. 2021 call a vessel a capillary when its radius is at most 3.5 um.
JI_CAPILLARY_MAX_DIAMETER_UM = 7.0


def contract_branches(graph: VascularGraph, capillary_max_diameter_um: float | None = JI_CAPILLARY_MAX_DIAMETER_UM
                      ) -> VascularGraph:
    """The branch graph: chains of edges through degree-2 nodes merged into one edge.

    Morphometric papers measure *branches* (vessel between two branch points
    or ends), not the pieces a reconstruction or a generator happens to use.
    Each branch keeps its path length (so length / end-to-end distance is its
    tortuosity), its length-weighted mean diameter, and its majority type;
    with ``capillary_max_diameter_um``, branches at most that wide are typed
    capillary regardless of their label (the Ji et al. 2021 definition).
    Closed loops (without a branch point, or back to the same one) are dropped.
    """
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components

    n, m = graph.n_nodes, graph.n_edges
    deg = np.bincount(graph.edges.ravel(), minlength=n)
    # Edges sharing a degree-2 node belong to the same branch.
    inner = np.flatnonzero(deg == 2)
    ends = np.concatenate([graph.edges[:, 0], graph.edges[:, 1]])
    edge_of_end = np.concatenate([np.arange(m), np.arange(m)])
    order = np.argsort(ends, kind="stable")
    ends_sorted, edges_sorted = ends[order], edge_of_end[order]
    first = np.searchsorted(ends_sorted, inner)
    pairs = np.stack([edges_sorted[first], edges_sorted[first + 1]], axis=1)
    adj = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(m, m))
    n_branch, branch_of = connected_components(adj, directed=False)

    length = np.bincount(branch_of, weights=graph.length, minlength=n_branch)
    diameter = np.bincount(branch_of, weights=graph.diameter * graph.length, minlength=n_branch) / length
    # Branch ends: nodes that are not degree 2, one at each end of the chain.
    is_end = deg[graph.edges] != 2  # (m, 2)
    ends_per_branch = [[] for _ in range(n_branch)]
    for k, side in zip(*np.nonzero(is_end)):
        ends_per_branch[branch_of[k]].append(graph.edges[k, side])
    # Majority type by length.
    types = np.unique(graph.vessel_type)
    weight = np.zeros((n_branch, len(types)))
    for i, t in enumerate(types):
        weight[:, i] = np.bincount(branch_of, weights=graph.length * (graph.vessel_type == t), minlength=n_branch)
    vtype = types[np.argmax(weight, axis=1)]
    if capillary_max_diameter_um is not None:
        vtype = np.where(diameter <= capillary_max_diameter_um * 1e-6 * (1 + 1e-9), VesselType.CAPILLARY, vtype)

    keep = np.array([len(e) == 2 and e[0] != e[1] for e in ends_per_branch])
    bedges = np.array([e for e, k in zip(ends_per_branch, keep) if k], dtype=np.int64).reshape(-1, 2)
    used = np.unique(bedges)
    remap = -np.ones(n, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return VascularGraph(
        positions=graph.positions[used],
        edges=remap[bedges],
        diameter=diameter[keep],
        length=length[keep],
        vessel_type=vtype[keep].astype(graph.vessel_type.dtype),
        depth=None if graph.depth is None else np.asarray(graph.depth)[used],
        layer=None if graph.layer is None else np.asarray(graph.layer)[used],
        meta=dict(graph.meta),
    )
