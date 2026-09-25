"""From a reconstructed graph to a solvable network: penetrating trees,
arterial/venous labels and boundary conditions.

Reconstructed graphs (e.g. the Kleinfeld-lab graphs) come without flow
boundary conditions and often without arterial/venous labels. The pipeline:

1. **Depth**: distance below the pial surface along a chosen axis.
2. **Penetrating trees**: connected components of the larger vessels
   (diameter above a threshold) that reach the surface. Each tree's
   shallowest node is where blood enters or leaves the column.
3. **Arterial or venous**: from labels in the data when present (best), or a
   heuristic. The heuristic ranks trees by the diameter where they enter the
   cortex and calls the widest fraction arterial (penetrating arterioles are
   wider on median, 11 vs 9 um, and ~3 times fewer; Blinder et al. 2013). It
   is weak, and its accuracy on synthetic ground truth is reported by the
   tests; use it only when no labels exist.
4. **Boundary conditions**: arterial entries at the arterial pressure, venous
   exits at the venous pressure (default 60 and 10 mmHg). Capillary dead ends
   at the crop faces are removed, i.e. no flow across the faces.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

from ..units import MMHG, UM
from .graph import VascularGraph, VesselType
from .networks import NetworkCase

ARTERIAL = (VesselType.PIAL_ARTERY, VesselType.PENETRATING_ARTERIOLE, VesselType.PRECAPILLARY_ARTERIOLE,
            VesselType.ARTERIOLE)
VENOUS = (VesselType.VENULE, VesselType.ASCENDING_VENULE, VesselType.PIAL_VEIN)


@dataclass
class PenetratingTree:
    """A penetrating vessel tree found in a graph: its edges, entry points, entry diameter and depth."""
    edges: np.ndarray  # edge indices of the tree
    entry_nodes: list  # dangling ends at the surface: where blood enters or leaves
    entry_diameter_um: float
    max_depth_um: float


def with_depth(graph: VascularGraph, axis: int = 2, surface: str = "min") -> VascularGraph:
    """Set depth below the surface along ``axis`` (surface at the min or max coordinate)."""
    coord = graph.positions[:, axis]
    depth = coord - coord.min() if surface == "min" else coord.max() - coord
    return replace(graph, depth=depth, meta=dict(graph.meta))


def find_penetrating_trees(graph: VascularGraph, large_diameter_um: float = 6.5,
                           surface_depth_um: float = 30.0, min_extent_um: float = 100.0) -> list[PenetratingTree]:
    """Components of vessels wider than ``large_diameter_um`` that start at the
    surface and reach at least ``min_extent_um`` into the cortex (short
    fragments near the surface are not penetrating vessels)."""
    if graph.depth is None:
        raise ValueError("the graph needs depth (see with_depth)")
    large = graph.diameter > large_diameter_um * UM
    idx = np.flatnonzero(large)
    if idx.size == 0:
        return []
    e = graph.edges[idx]
    adj = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(graph.n_nodes,) * 2)
    _, label = connected_components(adj, directed=False)
    comp_of_edge = label[e[:, 0]]
    depth_um = np.asarray(graph.depth) / UM
    degree = np.bincount(graph.edges.ravel(), minlength=graph.n_nodes)
    trees = []
    for c in np.unique(comp_of_edge):
        tree_edges = idx[comp_of_edge == c]
        nodes = np.unique(graph.edges[tree_edges].ravel())
        entry = int(nodes[np.argmin(depth_um[nodes])])
        if depth_um[entry] > surface_depth_um or depth_um[nodes].max() - depth_um[entry] < min_extent_um:
            continue  # deep segment not reaching the surface, or a short surface fragment
        # Entry points: vessel ends at the surface (penetrating-vessel tops, or
        # pial vessels cut at the faces of a crop); else the shallowest node.
        ends = [int(n) for n in nodes if degree[n] == 1 and depth_um[n] <= surface_depth_um]
        at_entry = tree_edges[(graph.edges[tree_edges] == entry).any(axis=1)]
        trees.append(PenetratingTree(
            edges=tree_edges,
            entry_nodes=ends or [entry],
            entry_diameter_um=float(graph.diameter[at_entry].max() / UM),
            max_depth_um=float(depth_um[nodes].max()),
        ))
    return trees


def labels_from_types(graph: VascularGraph, trees: list[PenetratingTree]) -> list[str]:
    """'arterial' or 'venous' per tree, by majority of labelled edge types."""
    out = []
    for t in trees:
        types = graph.vessel_type[t.edges]
        a = np.isin(types, ARTERIAL).sum()
        v = np.isin(types, VENOUS).sum()
        if a == v:
            raise ValueError(f"tree entering at nodes {t.entry_nodes} has no arterial/venous labels")
        out.append("arterial" if a > v else "venous")
    return out


def labels_by_entry_diameter(trees: list[PenetratingTree], arterial_fraction: float = 0.25) -> list[str]:
    """Heuristic: the widest ``arterial_fraction`` of trees at their entry are arterial."""
    n = len(trees)
    n_art = max(1, int(round(arterial_fraction * n))) if n > 1 else 0
    order = np.argsort([-t.entry_diameter_um for t in trees])
    labels = ["venous"] * n
    for i in order[:n_art]:
        labels[i] = "arterial"
    return labels


def _prune_dead_ends(graph: VascularGraph, keep_nodes: set[int]) -> tuple[VascularGraph, np.ndarray]:
    """Remove dead-end branches (except at ``keep_nodes``); returns the graph and the old-to-new node map (-1: removed)."""
    alive = np.ones(graph.n_edges, dtype=bool)
    protected = np.array(sorted(keep_nodes), dtype=np.int64)
    while True:
        deg = np.bincount(graph.edges[alive].ravel(), minlength=graph.n_nodes)
        dead = np.flatnonzero(deg == 1)
        dead = dead[~np.isin(dead, protected)]
        if dead.size == 0:
            break
        alive &= ~(np.isin(graph.edges[:, 0], dead) | np.isin(graph.edges[:, 1], dead))
    used = np.unique(graph.edges[alive])
    remap = -np.ones(graph.n_nodes, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return VascularGraph(
        positions=graph.positions[used], edges=remap[graph.edges[alive]], diameter=graph.diameter[alive],
        length=graph.length[alive], vessel_type=graph.vessel_type[alive],
        depth=None if graph.depth is None else np.asarray(graph.depth)[used],
        layer=None if graph.layer is None else np.asarray(graph.layer)[used],
        meta=dict(graph.meta),
    ), remap


def prepare_network(
    graph: VascularGraph,
    *,
    labels: str = "auto",
    large_diameter_um: float = 6.5,
    surface_depth_um: float = 30.0,
    arterial_fraction: float = 0.25,
    p_arterial_mmhg: float = 60.0,
    p_venous_mmhg: float = 10.0,
    hematocrit: float = 0.45,
) -> NetworkCase:
    """Penetrating trees, labels, vessel types and boundary conditions.

    ``labels``: "types" (use arterial/venous types in the graph), "diameter"
    (the heuristic), or "auto" (types when the trees carry them, otherwise
    the heuristic; the choice is recorded in the metadata).
    """
    trees = find_penetrating_trees(graph, large_diameter_um, surface_depth_um)
    if len(trees) < 2:
        raise ValueError("need at least two penetrating trees reaching the surface to set boundary conditions")
    method = labels
    if labels == "auto":
        labelled = [np.isin(graph.vessel_type[t.edges], ARTERIAL + VENOUS).any() for t in trees]
        method = "types" if all(labelled) else "diameter"
    if method == "types":
        tree_labels = labels_from_types(graph, trees)
    elif method == "diameter":
        tree_labels = labels_by_entry_diameter(trees, arterial_fraction)
    else:
        raise ValueError(f"unknown labels method {labels!r}")
    if "arterial" not in tree_labels or "venous" not in tree_labels:
        raise ValueError("labelling produced no arterial or no venous tree")

    # Unlabelled large vessels take the type of their tree.
    types = graph.vessel_type.copy()
    for t, lab in zip(trees, tree_labels):
        unl = t.edges[types[t.edges] == VesselType.UNCLASSIFIED]
        types[unl] = VesselType.PENETRATING_ARTERIOLE if lab == "arterial" else VesselType.ASCENDING_VENULE
    labelled_graph = replace(graph, vessel_type=types, meta=dict(graph.meta))

    entries = {n: lab for t, lab in zip(trees, tree_labels) for n in t.entry_nodes}
    pruned, remap = _prune_dead_ends(labelled_graph, set(entries))
    pressure_bc = {}
    for node, lab in entries.items():
        if remap[node] >= 0:
            pressure_bc[int(remap[node])] = (p_arterial_mmhg if lab == "arterial" else p_venous_mmhg) * MMHG
    sources = [n for n, lab in entries.items() if lab == "arterial" and remap[n] >= 0]
    sinks = [n for n, lab in entries.items() if lab == "venous" and remap[n] >= 0]
    return NetworkCase(
        graph=pruned,
        pressure_bc=pressure_bc,
        inlet_hematocrit=hematocrit,
        meta={
            "labels_method": method,
            "n_arterial_trees": len(sources),
            "n_venous_trees": len(sinks),
            "sources": [int(remap[n]) for n in sources],
            "sinks": [int(remap[n]) for n in sinks],
        },
    )
