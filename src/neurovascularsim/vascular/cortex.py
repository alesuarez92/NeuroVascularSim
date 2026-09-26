"""Synthetic mouse cortical column: a realistic vascular graph from published
statistics.

The column has four parts, built in this order:

1. **Capillary bed**: evenly spaced junctions (blue noise) joined to their
   nearest neighbours up to three vessels each, so most junctions have
   degree 3 and the junction spacing sets the segment length. The spacing is
   calibrated so the capillary length density (vessels at most 7 um wide, as
   counted by Ji et al. 2021, Neuron 109:1168) matches mouse somatosensory
   cortex (0.88 m/mm^3); the median segment is then ~60 um (Blinder et al.
   2013: 50 um). Diameters are drawn from a truncated normal of 4.0 ± 1.0 um
   on [2.5, 9] um (Schmid et al. 2017, PLoS Comput Biol 13:e1005392), and
   lengths are 1.27 times the straight distance (Ji et al. 2021). The earlier
   Voronoi foam (Smith et al. 2019) remains available as
   ``capillary_bed="foam"``; its segments are too short (~35 um).
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
with small jitter; layer boundaries are approximate for mouse S1. Every
number here is a parameter.

Calibration: penetrating arteriole density is the measured 17.4 per mm^2
(Adams et al. 2018); the spacing of their connections to the bed was chosen
to match the capillary topology measured by Ji et al. 2021 (mean branch
order 3.4 from the nearest non-capillary vessel). Perfusion was not a
calibration target: with these fixed-tissue diameters and the in-vivo
viscosity law it comes out well below the measured value (see
docs/networks.md for the diagnosis).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, minimum_spanning_tree
from scipy.spatial import Delaunay, Voronoi, cKDTree

from .. import registry
from ..units import MMHG, UM
from .graph import VascularGraph, VesselType
from .networks import NetworkCase

# Laminar boundaries of mouse vibrissal S1 (bottom of L1, L2/3, L4, L5 and
# L6), from the measured fractions of cortical depth in Hooks et al. 2011
# (PLoS Biol 9:e1000572, doi:10.1371/journal.pbio.1000572, Table 1: 0.09,
# 0.31, 0.46, 0.74, 1.0), scaled to the column depth of 1200 um.
LAYER_BOUNDS_UM = (0.0, 108.0, 372.0, 552.0, 888.0, 1200.0)
LAYER_NAMES = ("L1", "L2/3", "L4", "L5", "L6")


@dataclass
class MouseColumnParams:
    """Every parameter of the synthetic mouse column; units in the names, sources in the comments."""
    size_x_um: float = 600.0
    size_y_um: float = 600.0
    depth_um: float = 1200.0  # mean mouse cortical depth (Schmid et al. 2017)
    capillary_length_density: float = 0.9  # m/mm^3 (Ji et al. 2021)
    capillary_diameter_mean_um: float = 4.0  # Schmid et al. 2017
    capillary_diameter_sd_um: float = 1.0  # Schmid et al. 2017 (doi:10.1371/journal.pcbi.1005392)
    # Capillary bed: "nearest_neighbour" (evenly spaced junctions, each joined
    # to its nearest neighbours up to degree 3) or "foam" (Voronoi edges; the
    # earlier model, whose segments are too short; see docs/networks.md).
    capillary_bed: str = "nearest_neighbour"
    capillary_min_distance_fraction: float = 0.9  # model choice: junction exclusion radius / mean spacing
    capillary_edge_noise: float = 0.3  # model choice (log-normal SD of neighbour choice), fitted to segment lengths
    tortuosity: float = 1.27  # branch path length / end-to-end distance (Ji et al. 2021)
    l4_density_boost: float = 0.1  # shallow L4 peak (Blinder et al. 2013)
    pa_density_per_mm2: float = 17.4  # mouse sensory cortex (Adams et al. 2018)
    av_to_pa_ratio: float = 3.0  # Blinder et al. 2013 (mouse)
    pa_diameter_median_um: float = 11.0  # Blinder et al. 2013
    av_diameter_median_um: float = 9.0  # Blinder et al. 2013
    trunk_terminal_diameter_um: float = 6.0  # model choice: no source found for the taper
    connector_diameter_um: float = 6.0  # model choice: no source
    # Offshoot trees grown from each connection into the capillary mesh:
    # arteriolar (the arteriole-capillary transition zone; Mughal et al. 2023)
    # and postcapillary venular. Generations are calibrated so capillary
    # branch order matches Ji et al. 2021 (mean 3.4; ~7 branches between
    # penetrating arterioles and venules).
    arteriolar_offshoot_generations: int = 1
    venular_offshoot_generations: int = 1
    arteriolar_offshoot_diameters_um: tuple = (7.0, 6.0, 5.0, 4.5)
    venular_offshoot_diameters_um: tuple = (8.0, 7.0, 6.0, 5.0)
    branch_spacing_um: float = 60.0  # calibrated to capillary branch order (Ji et al. 2021)
    connections_per_level: int = 1
    # Number of levels along each trunk that connect to the bed, spread evenly
    # from the first level below the surface to the trunk end. 0 connects
    # every level (every branch_spacing_um).
    pa_branches_per_trunk: int = 0
    av_branches_per_trunk: int = 0
    pa_min_depth_fraction: float = 0.3  # model choice: no source for penetration depths
    # Capillary-free cylinder around penetrating arterioles: radius 53 +/- 9 um,
    # through layers I-IV (Kasischke et al. 2011, J Cereb Blood Flow Metab
    # 31:68, doi:10.1038/jcbfm.2010.158). 0 turns it off (the default for now).
    periarteriolar_free_radius_um: float = 0.0
    periarteriolar_free_depth_um: float = 552.0  # bottom of L4 (LAYER_BOUNDS_UM)
    # Inlet pressure calibrated so perfusion matches the measured cortical CBF
    # of awake C57BL/6 mice, 90.1 +/- 7.3 mL/100 g/min (Xu et al. 2022, J Cereb
    # Blood Flow Metab 42:811, doi:10.1177/0271678X211062279): 91 (adaptation
    # off) and 87 (on), seeds 0-3. No mouse pial pressure measurement was found.
    # Outlet 10 mmHg: pial venule pressure of Schmid et al. 2017.
    p_in_mmhg: float = 44.0
    p_out_mmhg: float = 10.0
    # "penetrating_tops": pressures fixed where arterioles and venules enter
    # the cortex (standard for cropped networks; Blinder et al. 2013, Schmid
    # et al. 2017). "pial_tree": one inlet and one outlet feeding pial trees.
    boundary: str = "penetrating_tops"
    # Systemic hematocrit of adult C57BL/6J males, median 41.5% (Mazzaccara et
    # al. 2008, PLoS One 3:e3772, doi:10.1371/journal.pone.0003772).
    hematocrit: float = 0.415
    seed: int = 0
    # Optional structural adaptation of diameters (vascular/adaptation.py;
    # Alberding & Secomb 2021). Off by default (owner's decision); the adapt_*
    # values are those of AdaptationParams, where their sources are given.
    structural_adaptation: bool = False
    adapt_steps: int = 200
    adapt_metabolic_signal: float = 0.1
    adapt_metabolic_source: str = "uniform"  # or "oxygen": growth factor from hypoxic tissue
    adapt_gf_permeability: float = 1.0
    adapt_oxygen_update_steps: int = 20
    adapt_k_m: float = 18.0
    adapt_k_s: float = 1.8
    adapt_tau_ref_dyn_cm2: float = 0.01
    adapt_q_ref_nl_min: float = 0.1
    adapt_conduction_length_um: float = 17300.0
    adapt_min_diameter_um: float = 2.5
    adapt_scope: str = "capillaries"
    tissue_pressure_mmhg: float = 5.1  # mouse intracranial pressure (Feiler et al. 2010; see adaptation.py)


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


def _blue_noise(n_points: int, r_min: float, lo: np.ndarray, hi: np.ndarray, rng: np.random.Generator,
                warp=None) -> np.ndarray:
    """``n_points`` random points at least ``r_min`` apart (a maximal
    independent set of a dense random cloud by Luby's algorithm, then a
    random subset). ``warp`` maps a uniform depth coordinate to depth."""
    n_try = int(8 * np.prod(hi - lo) / r_min**3) + n_points
    cand = rng.uniform(lo, hi, (n_try, 3))
    if warp is not None:
        cand[:, 2] = warp(cand[:, 2])
    pairs = cKDTree(cand).query_pairs(r_min, output_type="ndarray")
    a, b = pairs[:, 0], pairs[:, 1]
    alive = np.ones(n_try, dtype=bool)
    chosen = np.zeros(n_try, dtype=bool)
    while alive.any():
        priority = rng.uniform(size=n_try)
        priority[~alive] = np.inf
        live = alive[a] & alive[b]
        lowest = priority.copy()
        np.minimum.at(lowest, a[live], priority[b[live]])
        np.minimum.at(lowest, b[live], priority[a[live]])
        selected = alive & (priority <= lowest)
        chosen |= selected
        removed = selected.copy()
        removed[b[selected[a]]] = True
        removed[a[selected[b]]] = True
        alive &= ~removed
    pts = cand[chosen]
    if len(pts) > n_points:
        pts = pts[rng.choice(len(pts), n_points, replace=False)]
    return pts


def _nearest_neighbour_bed(p: MouseColumnParams, spacing_um: float, rng: np.random.Generator):
    """Capillary skeleton: evenly spaced junctions joined to near neighbours.

    Junctions are blue noise (at least ``capillary_min_distance_fraction`` x
    spacing apart) at mean spacing ``spacing_um``. Delaunay neighbours are
    joined shortest first (with log-normal noise) while both ends have fewer
    than three vessels: a mostly degree-3 network whose junction spacing,
    not an intermediate tessellation, sets the segment length. This matches
    measured beds (median segment ~50 um at 0.9 m/mm^3; Blinder et al. 2013,
    Ji et al. 2021), which a Voronoi foam cannot (its edges are too short).
    """
    lo = np.array([0.0, 0.0, 5.0])
    hi = np.array([p.size_x_um, p.size_y_um, p.depth_um])
    n_points = max(8, int(round(np.prod(hi - lo) / spacing_um**3)))
    pos = _blue_noise(n_points, p.capillary_min_distance_fraction * spacing_um, lo, hi, rng, _depth_warp(p))
    simplices = Delaunay(pos).simplices
    cand = np.vstack([simplices[:, [i, j]] for i in range(4) for j in range(i + 1, 4)])
    cand = np.unique(np.sort(cand, axis=1), axis=0)
    length = np.linalg.norm(pos[cand[:, 0]] - pos[cand[:, 1]], axis=1)
    ok = length <= 2.5 * spacing_um  # no long edges across the convex hull
    cand, length = cand[ok], length[ok]
    deg = np.zeros(len(pos), dtype=np.int64)
    keep = []
    for k in np.argsort(length * np.exp(rng.normal(0.0, p.capillary_edge_noise, len(length)))):
        a, b = cand[k]
        if deg[a] < 3 and deg[b] < 3:
            keep.append(k)
            deg[a] += 1
            deg[b] += 1
    return pos, cand[np.sort(keep)]


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


def _grow_offshoots(cedges, cdiam, ctype, n_cap_nodes, trees) -> None:
    """Relabel capillary edges as arteriolar or venular offshoot trees (in place).

    For each (seeds, generations, diameters, type): a breadth-first search
    from the seed nodes; the edge by which a node is first reached at depth g
    becomes a vessel of generation g. Nodes claimed by one tree are not
    entered by another, so arteriolar and venular trees never touch.
    """
    adj: list[list[tuple[int, int]]] = [[] for _ in range(n_cap_nodes)]
    for k, (a, b) in enumerate(cedges):
        adj[a].append((b, k))
        adj[b].append((a, k))
    claimed = np.zeros(n_cap_nodes, dtype=bool)
    for seeds, _, _, _ in trees:
        claimed[list(seeds)] = True
    for seeds, generations, diameters, vtype in trees:
        frontier = list(dict.fromkeys(seeds))
        for g in range(generations):
            nxt = []
            for u in frontier:
                for v, k in adj[u]:
                    if not claimed[v] and ctype[k] == VesselType.CAPILLARY:
                        claimed[v] = True
                        ctype[k] = vtype
                        cdiam[k] = diameters[min(g, len(diameters) - 1)]
                        nxt.append(v)
            frontier = nxt


def build_mouse_column(p: MouseColumnParams) -> NetworkCase:
    """Build a column whose final capillary length density matches the target.

    Capillaries are counted as Ji et al. 2021 measured them: every vessel at
    most 7 um wide (so thin connectors and offshoots count, wide offshoots
    do not). The bed is first built to the target and then rebuilt by the
    measured difference (usually one extra pass).
    """
    target = p.capillary_length_density
    foam_density = target
    case = None
    for _ in range(4):
        case = _build_mouse_column(p, foam_density)
        cap = case.graph.diameter <= 7.0 * UM * (1 + 1e-9)
        achieved = case.graph.length[cap].sum() * 1e3 / (case.graph.meta["volume_mm3"] * 1e3)
        if abs(achieved / target - 1) < 0.03:
            break
        foam_density *= target / achieved
    if p.structural_adaptation:
        from .adaptation import AdaptationParams, adapt_diameters

        case, _ = adapt_diameters(case, AdaptationParams(
            steps=p.adapt_steps, metabolic_signal=p.adapt_metabolic_signal,
            metabolic_source=p.adapt_metabolic_source, gf_permeability=p.adapt_gf_permeability,
            oxygen_update_steps=p.adapt_oxygen_update_steps, k_m=p.adapt_k_m, k_s=p.adapt_k_s,
            tau_ref_dyn_cm2=p.adapt_tau_ref_dyn_cm2, q_ref_nl_min=p.adapt_q_ref_nl_min,
            conduction_length_um=p.adapt_conduction_length_um, min_diameter_um=p.adapt_min_diameter_um,
            scope=p.adapt_scope, tissue_pressure_mmhg=p.tissue_pressure_mmhg))
    return case


def _build_mouse_column(p: MouseColumnParams, foam_length_density: float) -> NetworkCase:
    rng = np.random.default_rng(p.seed)
    volume_mm3 = p.size_x_um * p.size_y_um * p.depth_um * 1e-9

    # 1. Capillary bed, calibrated to the target length density. Length
    # density of the foam scales as 1/cell^2.
    if p.capillary_bed == "nearest_neighbour":
        make_bed, spacing = _nearest_neighbour_bed, 40.0
    elif p.capillary_bed == "foam":
        make_bed, spacing = _voronoi_foam, 100.0
    else:
        raise ValueError(f"unknown capillary_bed {p.capillary_bed!r}; use 'nearest_neighbour' or 'foam'")
    for _ in range(6):
        cpos, cedges = make_bed(p, spacing, np.random.default_rng(p.seed))
        seg = np.linalg.norm(cpos[cedges[:, 0]] - cpos[cedges[:, 1]], axis=1) * p.tortuosity
        density = seg.sum() * 1e-6 / volume_mm3  # m/mm^3
        if abs(density / foam_length_density - 1) < 0.03:
            break
        spacing *= np.sqrt(density / foam_length_density)

    positions = [cpos]
    edge_list = [cedges]
    diam = [np.clip(rng.normal(p.capillary_diameter_mean_um, p.capillary_diameter_sd_um, len(cedges)), 2.5, 9.0)]
    lengths = [seg]
    vtype = [np.full(len(cedges), VesselType.CAPILLARY)]
    n_nodes = len(cpos)
    tree = cKDTree(cpos)
    cap_degree = np.bincount(cedges.ravel(), minlength=len(cpos))
    used_capillary_nodes: set[int] = set()

    def add_nodes(xyz):
        """Append nodes at ``xyz`` (um); return their indices."""
        nonlocal n_nodes
        xyz = np.atleast_2d(xyz)
        idx = np.arange(n_nodes, n_nodes + len(xyz))
        positions.append(xyz)
        n_nodes += len(xyz)
        return idx

    def add_edges(pairs, d_um, t, length_um=None):
        """Append edges with diameter (um), type and length (um; default the straight distance)."""
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

    # Capillary-free tissue sleeve around penetrating arterioles: remove
    # capillaries whose midpoint lies within the radius of an arteriole axis
    # down to the given depth. Dead ends left behind are pruned at the end,
    # and the outer density calibration adds capillaries elsewhere.
    if p.periarteriolar_free_radius_um > 0:
        ce = edge_list[0]
        mid = 0.5 * (cpos[ce[:, 0]] + cpos[ce[:, 1]])
        r = np.min(np.linalg.norm(mid[:, None, :2] - pa_xy[None, :, :], axis=2), axis=1)
        drop = (r < p.periarteriolar_free_radius_um) & (mid[:, 2] <= p.periarteriolar_free_depth_um)
        if drop.any():
            keep = ~drop
            edge_list[0], diam[0], lengths[0], vtype[0] = ce[keep], diam[0][keep], lengths[0][keep], vtype[0][keep]
            cedges = edge_list[0]
            cap_degree[:] = np.bincount(cedges.ravel(), minlength=len(cpos))
            used_capillary_nodes.update(int(n) for n in np.flatnonzero(cap_degree == 0))

    seeds: dict[int, list[int]] = {VesselType.PRECAPILLARY_ARTERIOLE: [], VesselType.VENULE: []}

    def penetrating(xy, median_d, trunk_type, connector_type, n_branches):
        """Grow penetrating trunks at the surface points ``xy`` and connect them to the bed; return their tops and diameters."""
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
            levels = range(1, len(nodes))
            if n_branches > 0 and len(nodes) > 1:
                levels = np.unique(np.round(np.linspace(len(nodes) - 1, 1, max(1, n_branches))).astype(int))
            for k in levels:
                node = nodes[k]
                picks = p.connections_per_level + (1 if k == len(nodes) - 1 else 0)
                _, cand = tree.query(allpos[node], k=12)
                # Nearest free capillary junctions, those with a spare slot
                # first, so connections do not create degree-4 junctions.
                free = [int(c) for c in np.atleast_1d(cand) if c not in used_capillary_nodes]
                chosen = sorted(free, key=lambda c: cap_degree[c] >= 3)[:picks]
                for c in chosen:
                    used_capillary_nodes.add(int(c))
                    seeds[connector_type].append(int(c))
                    add_edges([node, c], p.connector_diameter_um, connector_type)
            tops.append(nodes[0])
            top_d.append(d0)
        return np.array(tops), np.array(top_d)

    pa_tops, pa_d = penetrating(pa_xy, p.pa_diameter_median_um, VesselType.PENETRATING_ARTERIOLE,
                                VesselType.PRECAPILLARY_ARTERIOLE, p.pa_branches_per_trunk)
    av_tops, av_d = penetrating(av_xy, p.av_diameter_median_um, VesselType.ASCENDING_VENULE, VesselType.VENULE,
                                p.av_branches_per_trunk)

    # Offshoot trees: breadth-first from the connection points through the
    # capillary mesh; tree edges of generation g become arteriolar (or
    # venular) vessels with the diameter of that generation.
    _grow_offshoots(cedges, diam[0], vtype[0], len(cpos), [
        (seeds[VesselType.PRECAPILLARY_ARTERIOLE], p.arteriolar_offshoot_generations,
         p.arteriolar_offshoot_diameters_um, VesselType.PRECAPILLARY_ARTERIOLE),
        (seeds[VesselType.VENULE], p.venular_offshoot_generations,
         p.venular_offshoot_diameters_um, VesselType.VENULE),
    ])

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
        "Synthetic mouse cortical column: capillary bed of evenly spaced degree-3 junctions calibrated "
        "to measured length density and segment length, penetrating arterioles and ascending venules (1:3), pial arterial and venous "
        "trees (Murray's law); depth and cortical layer on every node."
    ),
    reference=(
        "Statistics from Blinder et al. 2013 Nat Neurosci; Ji et al. 2021 Neuron; Schmid et al. "
        "2017 PLoS Comput Biol; Smith et al. 2019 Front Physiol"
    ),
    parameters={k: _DEFAULTS[k] for k in (
        "size_x_um", "size_y_um", "depth_um", "seed", "boundary", "capillary_bed", "pa_density_per_mm2", "av_to_pa_ratio",
        "pa_diameter_median_um", "av_diameter_median_um", "branch_spacing_um", "connections_per_level",
        "pa_branches_per_trunk", "av_branches_per_trunk",
        "arteriolar_offshoot_generations", "venular_offshoot_generations",
        "capillary_length_density", "capillary_diameter_mean_um", "capillary_diameter_sd_um", "tortuosity",
        "l4_density_boost", "p_in_mmhg", "p_out_mmhg", "hematocrit",
        "trunk_terminal_diameter_um", "connector_diameter_um", "pa_min_depth_fraction",
        "capillary_min_distance_fraction", "capillary_edge_noise",
        "structural_adaptation", "adapt_steps", "adapt_metabolic_signal", "adapt_metabolic_source",
        "adapt_gf_permeability", "adapt_oxygen_update_steps", "adapt_k_m", "adapt_k_s",
        "adapt_tau_ref_dyn_cm2", "adapt_q_ref_nl_min", "adapt_conduction_length_um", "adapt_min_diameter_um",
        "adapt_scope", "tissue_pressure_mmhg",
    )},
    choices={"boundary": ["penetrating_tops", "pial_tree"], "capillary_bed": ["nearest_neighbour", "foam"],
             "adapt_scope": ["capillaries", "microvessels", "all"],
             "adapt_metabolic_source": ["uniform", "oxygen"]},
)
def mouse_cortex_synthetic(**params) -> NetworkCase:
    """Network plugin: a synthetic mouse cortical column (see MouseColumnParams)."""
    unknown = set(params) - set(_DEFAULTS)
    if unknown:
        raise TypeError(f"unknown parameters {sorted(unknown)}")
    return build_mouse_column(MouseColumnParams(**params))
