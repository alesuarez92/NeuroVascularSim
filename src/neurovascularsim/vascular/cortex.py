"""Synthetic mouse cortical column: a realistic vascular graph from published
statistics.

The column has four parts, built in this order:

1. **Capillary bed**: the edges of a 3D Voronoi tessellation (a space-filling
   foam of mostly degree-3 junctions), following the constrained-Voronoi idea
   of Smith et al. 2019 (Front Physiol 10:233). Seed spacing is calibrated so
   the capillary length density matches measurements in mouse somatosensory
   cortex (0.88–0.98 m/mm^3; Ji et al. 2021, Neuron 109:1168). Diameters are
   drawn from a truncated normal of 4.0 ± 1.0 um on [2.5, 9] um (Schmid et
   al. 2017, PLoS Comput Biol 13:e1005392), and lengths include ~20%
   tortuosity (Smith et al. 2019).
2. **Penetrating arterioles and ascending venules**: vertical trunks placed
   on the surface with a minimum spacing, ~3 venules per arteriole and median
   surface diameters of 11 and 9 um (Blinder et al. 2013, Nat Neurosci
   16:889). Each trunk tapers with depth and connects to the capillary bed
   through precapillary arterioles or postcapillary venules every
   ``branch_spacing_um``.
3. **Pial trees**: an arterial tree joining an inlet to the arteriole tops
   and a venous tree joining the venule tops to an outlet (minimum spanning
   trees), with diameters from Murray's law.
4. **Boundary conditions**: inlet 60 mmHg, outlet 10 mmHg, i.e. the 50 mmHg
   arteriole-to-venule drop used by Blinder et al. 2013 and the 10 mmHg pial
   venule pressure of Schmid et al. 2017.

Simplifications, stated plainly: the capillary bed does not exchange flow
across the lateral faces of the column (closed box); trunks are straight
with small jitter; layer boundaries are approximate for mouse S1; the
density of penetrating vessels per mm^2 is a parameter (default read from
the networks in Schmid et al. 2017, Table 2) and should be checked against
the owner's data. Every number here is a parameter.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, minimum_spanning_tree
from scipy.spatial import Voronoi, cKDTree

from .. import registry
from ..units import MMHG, UM
from .graph import VascularGraph, VesselType
from .networks import NetworkCase

# Approximate laminar boundaries for mouse S1 (upper edge of L1, L2/3, L4, L5,
# L6 and bottom of L6), in um below the pia. To be refined with the owner's
# data or an atlas.
LAYER_BOUNDS_UM = (0.0, 120.0, 400.0, 550.0, 850.0, 1200.0)
LAYER_NAMES = ("L1", "L2/3", "L4", "L5", "L6")


@dataclass
class MouseColumnParams:
    size_x_um: float = 600.0
    size_y_um: float = 600.0
    depth_um: float = 1200.0  # mean mouse cortical depth (Schmid et al. 2017)
    capillary_length_density: float = 0.9  # m/mm^3 (Ji et al. 2021)
    capillary_diameter_mean_um: float = 4.0  # Schmid et al. 2017
    capillary_diameter_sd_um: float = 1.0
    tortuosity: float = 1.2  # Smith et al. 2019
    l4_density_boost: float = 0.1  # shallow L4 peak (Blinder et al. 2013)
    pa_density_per_mm2: float = 9.0  # from Schmid et al. 2017 networks (to verify)
    av_to_pa_ratio: float = 3.0  # Blinder et al. 2013 (mouse)
    pa_diameter_median_um: float = 11.0  # Blinder et al. 2013
    av_diameter_median_um: float = 9.0  # Blinder et al. 2013
    trunk_terminal_diameter_um: float = 6.0
    connector_diameter_um: float = 6.0
    branch_spacing_um: float = 25.0
    connections_per_level: int = 2
    pa_min_depth_fraction: float = 0.3
    p_in_mmhg: float = 60.0
    p_out_mmhg: float = 10.0
    # "penetrating_tops": pressures fixed where arterioles and venules enter
    # the cortex (standard for cropped networks; Blinder et al. 2013, Schmid
    # et al. 2017). "pial_tree": one inlet and one outlet feeding pial trees.
    boundary: str = "penetrating_tops"
    hematocrit: float = 0.45
    seed: int = 0


def layer_of_depth(depth_um: np.ndarray) -> np.ndarray:
    """Layer index 1..6 (1 = L1, 2 = L2/3, 3 = L4, 4 = L5, 5 = L6); 0 outside."""
    d = np.asarray(depth_um, dtype=float)
    idx = np.searchsorted(LAYER_BOUNDS_UM, d, side="right")
    idx[(d < 0) | (d > LAYER_BOUNDS_UM[-1])] = 0
    return idx


def _density_weight(z_um: np.ndarray, p: MouseColumnParams) -> np.ndarray:
    """Relative capillary seed density with depth: flat plus a shallow L4 peak."""
    l4_mid = 0.5 * (LAYER_BOUNDS_UM[2] + LAYER_BOUNDS_UM[3])
    return 1.0 + p.l4_density_boost * np.exp(-(((z_um - l4_mid) / 150.0) ** 2))


def _depth_warp(p: MouseColumnParams):
    """Map a uniform coordinate to depth so seed density follows the depth profile."""
    z = np.linspace(-200.0, p.depth_um + 200.0, 2001)
    c = np.concatenate([[0.0], np.cumsum(_density_weight(0.5 * (z[1:] + z[:-1]), p) ** (1 / 3) * np.diff(z))])
    c = c / c[-1] * (z[-1] - z[0]) + z[0]
    return lambda u: np.interp(u, c, z)


def _voronoi_foam(p: MouseColumnParams, cell_um: float, rng: np.random.Generator):
    """Capillary skeleton: Voronoi edges of a jittered body-centred cubic lattice.

    A regular (constrained) seed lattice gives Kelvin-foam-like cells whose
    edges have realistic lengths; a random seed cloud gives many tiny edges.
    Junctions of degree 4 are split into pairs of degree-3 junctions.
    """
    lx, ly, lz = p.size_x_um, p.size_y_um, p.depth_um
    pad = 1.5 * cell_um
    axes = [np.arange(-pad, L + pad, cell_um) for L in (lx, ly, lz)]
    grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1).reshape(-1, 3)
    pts = np.vstack([grid, grid + cell_um / 2])
    pts = pts + rng.normal(0.0, 0.12 * cell_um, pts.shape)
    pts[:, 2] = _depth_warp(p)(pts[:, 2])
    vor = Voronoi(pts)

    inside = np.all((vor.vertices >= [0, 0, 5.0]) & (vor.vertices <= [lx, ly, lz]), axis=1)
    edges = set()
    for ridge in vor.ridge_vertices:
        if -1 in ridge:
            continue
        for a, b in zip(ridge, ridge[1:] + ridge[:1]):
            if inside[a] and inside[b] and a != b:
                edges.add((a, b) if a < b else (b, a))
    edges = np.array(sorted(edges), dtype=np.int64).reshape(-1, 2)
    used = np.unique(edges)
    remap = -np.ones(len(vor.vertices), dtype=np.int64)
    remap[used] = np.arange(len(used))
    pos = vor.vertices[used]
    edges = remap[edges]
    return _split_high_degree(pos, _remove_matching(len(pos), edges, rng))


def _remove_matching(n_nodes: int, edges: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Drop a random near-perfect matching among degree-4 junctions.

    Each removed edge lowers two degree-4 junctions to degree 3, so the foam
    becomes mostly degree 3 without adding short joining edges.
    """
    deg = np.bincount(edges.ravel(), minlength=n_nodes)
    keep = np.ones(len(edges), dtype=bool)
    for k in rng.permutation(len(edges)):
        a, b = edges[k]
        if deg[a] > 3 and deg[b] > 3:
            keep[k] = False
            deg[a] -= 1
            deg[b] -= 1
    return edges[keep]


def _split_high_degree(pos: np.ndarray, edges: np.ndarray):
    """Split junctions of degree > 3 into degree-3 junctions joined by short edges."""
    pos = list(map(np.asarray, pos))
    edges = [list(e) for e in edges]
    incident: dict[int, list[int]] = {}
    for k, (a, b) in enumerate(edges):
        incident.setdefault(a, []).append(k)
        incident.setdefault(b, []).append(k)
    for node in list(incident):
        ks = incident[node]
        while len(ks) > 3:
            # Move two edges to a new node placed slightly toward their far ends.
            moved, ks = ks[:2], ks[2:]
            far = [edges[k][1] if edges[k][0] == node else edges[k][0] for k in moved]
            new = len(pos)
            # Place the new junction partway toward the moved edges' far ends,
            # so the joining edge has a capillary-like length.
            direction = np.mean([pos[f] - pos[node] for f in far], axis=0)
            if np.linalg.norm(direction) == 0:
                direction = np.array([2.0, 0.0, 0.0])
            pos.append(pos[node] + 0.4 * direction)
            for k in moved:
                edges[k] = [new if x == node else x for x in edges[k]]
            edges.append([node, new])
            link = len(edges) - 1
            incident[new] = moved + [link]
            ks = ks + [link]
        incident[node] = ks
    return np.array(pos), np.array(edges, dtype=np.int64)


def _prune_dead_ends(n_nodes: int, edges: np.ndarray, protected: set[int]) -> np.ndarray:
    """Remove chains ending in degree-1 nodes (they carry no flow)."""
    alive = np.ones(len(edges), dtype=bool)
    while True:
        deg = np.bincount(edges[alive].ravel(), minlength=n_nodes)
        dead_nodes = np.flatnonzero(deg == 1)
        dead_nodes = dead_nodes[~np.isin(dead_nodes, list(protected))]
        if dead_nodes.size == 0:
            return alive
        hit = np.isin(edges[:, 0], dead_nodes) | np.isin(edges[:, 1], dead_nodes)
        alive &= ~hit


def _surface_points(n: int, p: MouseColumnParams, rng, existing: np.ndarray, min_dist: float) -> np.ndarray:
    """Dart throwing on the pial surface with a minimum spacing."""
    margin = 0.08 * min(p.size_x_um, p.size_y_um)
    pts = [tuple(e) for e in existing]
    out = []
    for _ in range(20000):
        if len(out) == n:
            break
        c = rng.uniform([margin, margin], [p.size_x_um - margin, p.size_y_um - margin])
        if all(np.hypot(*(c - np.asarray(q))) >= min_dist for q in pts):
            pts.append(tuple(c))
            out.append(c)
    return np.array(out).reshape(-1, 2)


def _murray_tree(root: int, nodes_xy: np.ndarray, leaf_diam: dict[int, float]):
    """Minimum spanning tree over points; diameters by Murray's law from the leaves."""
    n = len(nodes_xy)
    d = np.hypot(*(nodes_xy[:, None, :] - nodes_xy[None, :, :]).transpose(2, 0, 1))
    mst = minimum_spanning_tree(d + 1e-9 * (d == 0)).tocoo()
    adj = [[] for _ in range(n)]
    for a, b in zip(mst.row, mst.col):
        adj[a].append(b)
        adj[b].append(a)
    parent = -np.ones(n, dtype=int)
    order, stack, seen = [], [root], {root}
    while stack:
        u = stack.pop()
        order.append(u)
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                parent[v] = u
                stack.append(v)
    cube = {i: leaf_diam.get(i, 0.0) ** 3 for i in range(n)}
    for u in reversed(order):
        if parent[u] >= 0:
            cube[parent[u]] += cube[u]
    return [(parent[v], v, cube[v] ** (1.0 / 3.0)) for v in order if parent[v] >= 0]


def build_mouse_column(p: MouseColumnParams) -> NetworkCase:
    rng = np.random.default_rng(p.seed)
    volume_mm3 = p.size_x_um * p.size_y_um * p.depth_um * 1e-9

    # 1. Capillary bed, calibrated to the target length density. Length
    # density of the foam scales as 1/cell^2.
    spacing = 100.0
    for _ in range(4):
        cpos, cedges = _voronoi_foam(p, spacing, np.random.default_rng(p.seed))
        seg = np.linalg.norm(cpos[cedges[:, 0]] - cpos[cedges[:, 1]], axis=1) * p.tortuosity
        density = seg.sum() * 1e-6 / volume_mm3  # m/mm^3
        if abs(density / p.capillary_length_density - 1) < 0.03:
            break
        spacing *= np.sqrt(density / p.capillary_length_density)

    positions = [cpos]
    edge_list = [cedges]
    diam = [np.clip(rng.normal(p.capillary_diameter_mean_um, p.capillary_diameter_sd_um, len(cedges)), 2.5, 9.0)]
    lengths = [seg]
    vtype = [np.full(len(cedges), VesselType.CAPILLARY)]
    n_nodes = len(cpos)
    tree = cKDTree(cpos)
    used_capillary_nodes: set[int] = set()

    def add_nodes(xyz):
        nonlocal n_nodes
        xyz = np.atleast_2d(xyz)
        idx = np.arange(n_nodes, n_nodes + len(xyz))
        positions.append(xyz)
        n_nodes += len(xyz)
        return idx

    def add_edges(pairs, d_um, t, length_um=None):
        pairs = np.atleast_2d(np.asarray(pairs, dtype=np.int64))
        allpos = np.vstack(positions)
        euclid = np.linalg.norm(allpos[pairs[:, 0]] - allpos[pairs[:, 1]], axis=1)
        edge_list.append(pairs)
        diam.append(np.broadcast_to(np.asarray(d_um, dtype=float), len(pairs)).copy())
        lengths.append(np.maximum(euclid if length_um is None else length_um, 1.0))
        vtype.append(np.full(len(pairs), t))

    # 2. Penetrating arterioles and ascending venules.
    area_mm2 = p.size_x_um * p.size_y_um * 1e-6
    n_pa = max(1, int(round(p.pa_density_per_mm2 * area_mm2)))
    n_av = max(1, int(round(p.av_to_pa_ratio * n_pa)))
    min_dist = 0.5 / np.sqrt((n_pa + n_av) / (p.size_x_um * p.size_y_um))
    pa_xy = _surface_points(n_pa, p, rng, np.empty((0, 2)), min_dist)
    av_xy = _surface_points(n_av, p, rng, pa_xy, min_dist)

    def penetrating(xy, median_d, trunk_type, connector_type):
        tops, top_d = [], []
        for x, y in xy:
            frac = rng.uniform(p.pa_min_depth_fraction, 1.0)
            depth = frac * p.depth_um
            z = np.arange(0.0, depth + 1e-9, p.branch_spacing_um)
            jitter = np.cumsum(rng.normal(0, 3.0, size=(len(z), 2)), axis=0)
            jitter[0] = 0
            nodes = add_nodes(np.column_stack([x + jitter[:, 0], y + jitter[:, 1], z]))
            d0 = median_d * float(np.exp(rng.normal(0, 0.25)))
            d_nodes = np.linspace(d0, min(p.trunk_terminal_diameter_um, d0), len(z))
            if len(nodes) > 1:
                add_edges(np.column_stack([nodes[:-1], nodes[1:]]), 0.5 * (d_nodes[:-1] + d_nodes[1:]), trunk_type)
            allpos = np.vstack(positions)
            for k, node in enumerate(nodes[1:], start=1):
                picks = p.connections_per_level + (1 if k == len(nodes) - 1 else 0)
                _, cand = tree.query(allpos[node], k=12)
                chosen = [c for c in np.atleast_1d(cand) if c not in used_capillary_nodes][:picks]
                for c in chosen:
                    used_capillary_nodes.add(int(c))
                    add_edges([node, c], p.connector_diameter_um, connector_type)
            tops.append(nodes[0])
            top_d.append(d0)
        return np.array(tops), np.array(top_d)

    pa_tops, pa_d = penetrating(pa_xy, p.pa_diameter_median_um, VesselType.PENETRATING_ARTERIOLE,
                                VesselType.PRECAPILLARY_ARTERIOLE)
    av_tops, av_d = penetrating(av_xy, p.av_diameter_median_um, VesselType.ASCENDING_VENULE, VesselType.VENULE)

    # 3. Boundary conditions: at the penetrating-vessel tops, or through pial
    # trees rooted at an inlet and an outlet on opposite faces.
    if p.boundary == "penetrating_tops":
        sources, sinks = list(pa_tops), list(av_tops)
    elif p.boundary == "pial_tree":
        inlet = add_nodes([0.0, p.size_y_um / 2, 0.0])[0]
        outlet = add_nodes([p.size_x_um, p.size_y_um / 2, 0.0])[0]
        allpos = np.vstack(positions)
        for root, tops, dtop, t in ((inlet, pa_tops, pa_d, VesselType.PIAL_ARTERY),
                                    (outlet, av_tops, av_d, VesselType.PIAL_VEIN)):
            ids = np.concatenate([[root], tops])
            leaf = {i + 1: float(d) for i, d in enumerate(dtop)}
            for a, b, d in _murray_tree(0, allpos[ids, :2], leaf):
                add_edges([ids[a], ids[b]], d, t)
        sources, sinks = [inlet], [outlet]
    else:
        raise ValueError(f"unknown boundary {p.boundary!r}; use 'penetrating_tops' or 'pial_tree'")

    pos = np.vstack(positions)
    edges = np.vstack(edge_list)
    d_um = np.concatenate(diam)
    l_um = np.concatenate(lengths)
    types = np.concatenate(vtype)

    # Keep the component joining sources to sinks; drop dead ends.
    alive = _prune_dead_ends(len(pos), edges, set(sources) | set(sinks))
    edges, d_um, l_um, types = edges[alive], d_um[alive], l_um[alive], types[alive]
    adj = coo_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(len(pos), len(pos)))
    _, label = connected_components(adj, directed=False)
    main = np.bincount(label[edges.ravel()]).argmax()
    sources = [n for n in sources if label[n] == main]
    sinks = [n for n in sinks if label[n] == main]
    if not sources or not sinks:
        raise RuntimeError("generated column does not connect arterioles to venules; try another seed")
    keep_edge = label[edges[:, 0]] == main
    edges, d_um, l_um, types = edges[keep_edge], d_um[keep_edge], l_um[keep_edge], types[keep_edge]
    used = np.unique(edges)
    remap = -np.ones(len(pos), dtype=np.int64)
    remap[used] = np.arange(len(used))
    pos = pos[used]
    edges = remap[edges]

    depth = pos[:, 2]
    graph = VascularGraph(
        positions=pos * UM,
        edges=edges,
        diameter=d_um * UM,
        length=l_um * UM,
        vessel_type=types,
        depth=depth * UM,
        layer=layer_of_depth(depth),
        meta={
            "name": "mouse_cortex_synthetic",
            "species": "mouse",
            "volume_mm3": volume_mm3,
            "layer_bounds_um": list(LAYER_BOUNDS_UM),
            "layer_names": list(LAYER_NAMES),
        },
    )
    return NetworkCase(
        graph=graph,
        pressure_bc={
            **{int(remap[n]): p.p_in_mmhg * MMHG for n in sources},
            **{int(remap[n]): p.p_out_mmhg * MMHG for n in sinks},
        },
        inlet_hematocrit=p.hematocrit,
        meta={
            "params": asdict(p),
            "n_penetrating_arterioles": int(n_pa),
            "n_ascending_venules": int(n_av),
            "capillary_cell_um": float(spacing),
            "sources": [int(remap[n]) for n in sources],
            "sinks": [int(remap[n]) for n in sinks],
        },
    )


_DEFAULTS = asdict(MouseColumnParams())


@registry.register(
    "network",
    "mouse_cortex_synthetic",
    description=(
        "Synthetic mouse cortical column: Voronoi capillary bed calibrated to measured length "
        "density, penetrating arterioles and ascending venules (1:3), pial arterial and venous "
        "trees (Murray's law); depth and cortical layer on every node."
    ),
    reference=(
        "Statistics from Blinder et al. 2013 Nat Neurosci; Ji et al. 2021 Neuron; Schmid et al. "
        "2017 PLoS Comput Biol; Smith et al. 2019 Front Physiol"
    ),
    parameters={k: _DEFAULTS[k] for k in (
        "size_x_um", "size_y_um", "depth_um", "seed", "pa_density_per_mm2", "av_to_pa_ratio",
        "capillary_length_density", "capillary_diameter_mean_um", "p_in_mmhg", "p_out_mmhg", "hematocrit",
    )},
)
def mouse_cortex_synthetic(**params) -> NetworkCase:
    unknown = set(params) - set(_DEFAULTS)
    if unknown:
        raise TypeError(f"unknown parameters {sorted(unknown)}")
    return build_mouse_column(MouseColumnParams(**params))
