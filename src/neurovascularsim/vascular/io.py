"""Reading and writing vascular graphs.

Two CSV dialects are read (separator detected automatically):

- **NeuroVascularSim**: ``nodes.csv`` with ``id, x_um, y_um, z_um`` (optional
  ``depth_um``) and ``edges.csv`` with ``node1, node2, diameter_um,
  length_um`` (optional ``type``, a :class:`VesselType` name).
- **VesselGraph / Voreen** (Paetzold et al. 2021, which includes the
  Kleinfeld-lab whole-brain graphs of Ji et al. 2021): ``nodes`` with ``id,
  pos_x, pos_y, pos_z`` and ``edges`` with ``node1id, node2id, avgRadiusAvg``
  and ``length`` (or ``distance``), in voxels; pass ``voxel_size_um``.

Graphs without vessel types are labelled by diameter: capillary below a
threshold, otherwise ``UNCLASSIFIED`` (arterial and venous trees need labels
or a classification step before boundary conditions can be set).

Data files are not part of the repository: lab data stay private, and public
datasets keep their own licences (VesselGraph data are CC BY-NC 4.0).
"""

from __future__ import annotations

import csv
import os
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

from .. import registry
from ..units import UM
from .graph import VascularGraph, VesselType
from .networks import NetworkCase

DATA_DIR = Path(os.environ.get("NVS_DATA_DIR", "data"))


def _read_table(path: Path) -> dict[str, np.ndarray]:
    text = Path(path).read_text()
    sep = ";" if text.count(";") > text.count(",") else ","
    rows = list(csv.reader(text.splitlines(), delimiter=sep))
    header = [h.strip() for h in rows[0]]
    body = [r for r in rows[1:] if r]
    cols = {}
    for i, name in enumerate(header):
        values = [r[i].strip() for r in body]
        try:
            cols[name] = np.array(values, dtype=float)
        except ValueError:
            cols[name] = np.array(values, dtype=object)
    return cols


def load_graph_csv(
    nodes_path: str | Path,
    edges_path: str | Path,
    *,
    voxel_size_um: float = 1.0,
    capillary_max_diameter_um: float = 8.0,
) -> VascularGraph:
    """Read a graph from node and edge tables (dialect detected from columns)."""
    nodes = _read_table(nodes_path)
    edges = _read_table(edges_path)

    if {"x_um", "y_um", "z_um"} <= nodes.keys():
        ids = nodes["id"].astype(np.int64)
        xyz_um = np.column_stack([nodes["x_um"], nodes["y_um"], nodes["z_um"]])
        e_a, e_b = edges["node1"].astype(np.int64), edges["node2"].astype(np.int64)
        d_um = edges["diameter_um"]
        length_um = edges.get("length_um")
        source = "neurovascularsim"
    elif {"pos_x", "pos_y", "pos_z"} <= nodes.keys():
        ids = nodes["id"].astype(np.int64)
        xyz_um = np.column_stack([nodes["pos_x"], nodes["pos_y"], nodes["pos_z"]]) * voxel_size_um
        e_a, e_b = edges["node1id"].astype(np.int64), edges["node2id"].astype(np.int64)
        radius = edges.get("avgRadiusAvg", edges.get("radius"))
        if radius is None:
            raise ValueError("edge table has no radius column (avgRadiusAvg)")
        d_um = 2.0 * np.abs(radius) * voxel_size_um
        length = edges.get("length", edges.get("distance"))
        length_um = None if length is None else length * voxel_size_um
        source = "vesselgraph"
    else:
        raise ValueError("unrecognised node table: expected x_um/y_um/z_um or pos_x/pos_y/pos_z columns")

    index = {int(i): k for k, i in enumerate(ids)}
    try:
        pairs = np.array([[index[int(a)], index[int(b)]] for a, b in zip(e_a, e_b)], dtype=np.int64)
    except KeyError as e:
        raise ValueError(f"edge refers to unknown node id {e}") from None
    keep = pairs[:, 0] != pairs[:, 1]
    pairs, d_um = pairs[keep], d_um[keep]
    euclid_um = np.linalg.norm(xyz_um[pairs[:, 0]] - xyz_um[pairs[:, 1]], axis=1)
    # A stated centreline length is trusted (it includes tortuosity, and
    # schematic layouts need not match it); otherwise use the straight line.
    length_um = euclid_um if length_um is None else length_um[keep]
    d_um = np.maximum(d_um, 1.5)  # the in-vivo viscosity law needs D > 1.1 um

    if "type" in edges:
        types = np.array([VesselType[str(t).strip().upper()] for t in edges["type"][keep]])
    else:
        types = np.where(d_um <= capillary_max_diameter_um, VesselType.CAPILLARY, VesselType.UNCLASSIFIED)

    depth = nodes["depth_um"] * UM if "depth_um" in nodes else None
    return VascularGraph(
        positions=xyz_um * UM,
        edges=pairs,
        diameter=d_um * UM,
        length=np.maximum(length_um, 0.1) * UM,
        vessel_type=types,
        depth=depth,
        meta={"source": source, "nodes_file": str(nodes_path), "edges_file": str(edges_path)},
    )


def crop(graph: VascularGraph, lo_um, hi_um, *, largest_component: bool = True) -> VascularGraph:
    """Keep edges whose two nodes lie inside the box [lo, hi] (um)."""
    lo, hi = np.asarray(lo_um) * UM, np.asarray(hi_um) * UM
    inside = np.all((graph.positions >= lo) & (graph.positions <= hi), axis=1)
    keep = inside[graph.edges[:, 0]] & inside[graph.edges[:, 1]]
    edges = graph.edges[keep]
    if largest_component and len(edges):
        adj = coo_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(graph.n_nodes,) * 2)
        _, label = connected_components(adj, directed=False)
        main = np.bincount(label[edges.ravel()]).argmax()
        comp = label[edges[:, 0]] == main
        keep[np.flatnonzero(keep)[~comp]] = False
        edges = graph.edges[keep]
    used = np.unique(edges)
    remap = -np.ones(graph.n_nodes, dtype=np.int64)
    remap[used] = np.arange(len(used))
    meta = dict(graph.meta, crop_um=[list(map(float, lo_um)), list(map(float, hi_um))],
                volume_mm3=float(np.prod(np.asarray(hi_um) - np.asarray(lo_um)) * 1e-9))
    return VascularGraph(
        positions=graph.positions[used],
        edges=remap[edges],
        diameter=graph.diameter[keep],
        length=graph.length[keep],
        vessel_type=graph.vessel_type[keep],
        depth=None if graph.depth is None else np.asarray(graph.depth)[used],
        layer=None if graph.layer is None else np.asarray(graph.layer)[used],
        meta=meta,
    )


def save_graph_csv(graph: VascularGraph, nodes_path: str | Path, edges_path: str | Path) -> None:
    """Write the NeuroVascularSim CSV dialect (micrometres)."""
    xyz = graph.positions / UM
    with open(nodes_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "x_um", "y_um", "z_um"] + (["depth_um"] if graph.depth is not None else []))
        for i, p in enumerate(xyz):
            extra = [f"{graph.depth[i] / UM:.4f}"] if graph.depth is not None else []
            w.writerow([i, *(f"{v:.4f}" for v in p), *extra])
    with open(edges_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["node1", "node2", "diameter_um", "length_um", "type"])
        for (a, b), d, length, t in zip(graph.edges, graph.diameter, graph.length, graph.vessel_type):
            w.writerow([a, b, f"{d / UM:.4f}", f"{length / UM:.4f}", VesselType(int(t)).name])


def _data_path(name: str) -> Path:
    """Resolve a file name inside the data directory; never outside it."""
    base = DATA_DIR.resolve()
    path = (base / name).resolve()
    if base not in path.parents and path != base:
        raise ValueError(f"data files must be inside {base}")
    if not path.exists():
        raise ValueError(f"no such data file: {name} (looked in {base})")
    return path


@registry.register(
    "network",
    "graph_files",
    description=(
        "A vascular graph read from node and edge CSV files in the data directory "
        "(NeuroVascularSim or VesselGraph/Voreen format, e.g. the Kleinfeld-lab graphs), "
        "optionally cropped to a box. Boundary conditions must be supplied before flow can be solved."
    ),
    reference="VesselGraph: Paetzold et al. 2021 (NeurIPS Datasets); Kleinfeld lab: Ji et al. 2021 Neuron",
    parameters={
        "nodes_file": "nodes.csv",
        "edges_file": "edges.csv",
        "voxel_size_um": 1.0,
        "crop_lo_um": None,
        "crop_hi_um": None,
    },
)
def graph_files(nodes_file="nodes.csv", edges_file="edges.csv", voxel_size_um=1.0,
                crop_lo_um=None, crop_hi_um=None) -> NetworkCase:
    graph = load_graph_csv(_data_path(nodes_file), _data_path(edges_file), voxel_size_um=voxel_size_um)
    if crop_lo_um is not None and crop_hi_um is not None:
        graph = crop(graph, crop_lo_um, crop_hi_um)
    return NetworkCase(graph=graph, pressure_bc={}, inlet_hematocrit=0.45,
                       meta={"needs_boundary_conditions": True})
