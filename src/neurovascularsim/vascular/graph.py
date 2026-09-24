"""The vascular graph: nodes and edges (vessel segments) with geometry.

Everything is stored as numpy arrays in SI units, so fields computed on the
graph (flow, hematocrit, pressure, concentrations) are plain arrays indexed
by edge or node.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import IntEnum

import numpy as np


class VesselType(IntEnum):
    """Segment classes. Pathways and mural cells depend on the class."""

    PIAL_ARTERY = 0
    PENETRATING_ARTERIOLE = 1
    PRECAPILLARY_ARTERIOLE = 2  # arteriole–capillary transition, ensheathing pericytes
    CAPILLARY = 3
    VENULE = 4
    ASCENDING_VENULE = 5
    PIAL_VEIN = 6
    ARTERIOLE = 7  # generic arteriole (idealised networks)


@dataclass
class VascularGraph:
    """A vascular network.

    Attributes:
        positions: (n_nodes, 3) node coordinates, m.
        edges: (n_edges, 2) node indices; edge k runs from ``edges[k, 0]`` to
            ``edges[k, 1]``. This orientation is the sign convention for flow.
        diameter: (n_edges,) inner diameter, m.
        length: (n_edges,) segment length, m.
        vessel_type: (n_edges,) :class:`VesselType` codes.
        depth: optional (n_nodes,) cortical depth below the pial surface, m.
        layer: optional (n_nodes,) cortical layer label (1–6), 0 if unknown.
        meta: free-form metadata (source, species, units notes).
    """

    positions: np.ndarray
    edges: np.ndarray
    diameter: np.ndarray
    length: np.ndarray
    vessel_type: np.ndarray
    depth: np.ndarray | None = None
    layer: np.ndarray | None = None
    meta: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.positions = np.asarray(self.positions, dtype=float).reshape(-1, 3)
        self.edges = np.asarray(self.edges, dtype=np.int64).reshape(-1, 2)
        self.diameter = np.asarray(self.diameter, dtype=float)
        self.length = np.asarray(self.length, dtype=float)
        self.vessel_type = np.asarray(self.vessel_type, dtype=np.int64)
        self.validate()

    @property
    def n_nodes(self) -> int:
        return self.positions.shape[0]

    @property
    def n_edges(self) -> int:
        return self.edges.shape[0]

    def validate(self) -> None:
        m = self.n_edges
        for name in ("diameter", "length", "vessel_type"):
            if getattr(self, name).shape != (m,):
                raise ValueError(f"{name} must have shape ({m},)")
        if m and (self.edges.min() < 0 or self.edges.max() >= self.n_nodes):
            raise ValueError("edge refers to a node that does not exist")
        if np.any(self.edges[:, 0] == self.edges[:, 1]):
            raise ValueError("self-loop edges are not allowed")
        if np.any(self.diameter <= 0) or np.any(self.length <= 0):
            raise ValueError("diameters and lengths must be positive")
        for name in ("depth", "layer"):
            arr = getattr(self, name)
            if arr is not None and np.asarray(arr).shape != (self.n_nodes,):
                raise ValueError(f"{name} must have shape ({self.n_nodes},)")

    def with_diameter(self, diameter: np.ndarray) -> "VascularGraph":
        """A copy with new edge diameters (e.g. after dilation)."""
        return replace(self, diameter=np.array(diameter, dtype=float), meta=dict(self.meta))

    def incidence(self) -> tuple[np.ndarray, np.ndarray]:
        """For each node, the edges leaving and entering it (by orientation)."""
        out_edges = [[] for _ in range(self.n_nodes)]
        in_edges = [[] for _ in range(self.n_nodes)]
        for k, (a, b) in enumerate(self.edges):
            out_edges[a].append(k)
            in_edges[b].append(k)
        return (
            np.array([np.array(e, dtype=np.int64) for e in out_edges], dtype=object),
            np.array([np.array(e, dtype=np.int64) for e in in_edges], dtype=object),
        )
