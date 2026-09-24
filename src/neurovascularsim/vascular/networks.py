"""Network builders: idealised test networks now, reconstructed and synthetic
networks (mouse angiograms, generated cortical columns) later.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .. import registry
from ..units import MMHG, UM
from .graph import VascularGraph, VesselType


@dataclass
class NetworkCase:
    """A network ready to solve: graph, boundary conditions and metadata."""

    graph: VascularGraph
    pressure_bc: dict[int, float]
    inlet_hematocrit: float = 0.45
    meta: dict = field(default_factory=dict)


@registry.register(
    "network",
    "suarez2021a",
    description=(
        "Idealised symmetric 22-segment microvascular tree: 1 arteriole, 2 feeding "
        "arterioles, 4 daughter arterioles, 8 capillaries, 4+2+1 venules."
    ),
    reference="Suarez et al. 2021 J Theor Biol 529:110856, Table 1",
    parameters={
        "d_feeding_um": 17.5,
        "l_feeding_um": 100.0,
        "d_daughter_um": 11.0,
        "l_daughter_um": 100.0,
        "p_in_mmhg": 60.0,
        "p_out_mmhg": 25.0,
        "hematocrit": 0.45,
    },
)
def suarez2021a(
    d_feeding_um: float = 17.5,
    l_feeding_um: float = 100.0,
    d_daughter_um: float = 11.0,
    l_daughter_um: float = 100.0,
    p_in_mmhg: float = 60.0,
    p_out_mmhg: float = 25.0,
    hematocrit: float = 0.45,
) -> NetworkCase:
    """The network of Suarez et al. 2021a.

    The topology follows from Table 1 and the paper's 14 unknown node
    pressures: each daughter arteriole splits into two capillaries, which
    rejoin at a 3rd-order venule. Edge 3 is the actively dilated arteriole
    (the paper's segment 4) and edge 4 its passive sibling (segment 5).
    Node positions are a schematic 2D layout.
    """
    A, C, V = VesselType.ARTERIOLE, VesselType.CAPILLARY, VesselType.VENULE
    # (from, to, diameter um, length um, type)
    segs = [(0, 1, 27.5, 100.0, A)]
    segs += [(1, 2, d_feeding_um, l_feeding_um, A), (1, 3, d_feeding_um, l_feeding_um, A)]
    segs += [(2, 4, d_daughter_um, l_daughter_um, A), (2, 5, d_daughter_um, l_daughter_um, A)]
    segs += [(3, 6, d_daughter_um, l_daughter_um, A), (3, 7, d_daughter_um, l_daughter_um, A)]
    for i in range(4):
        segs += [(4 + i, 8 + i, 8.0, 250.0, C), (4 + i, 8 + i, 8.0, 250.0, C)]
    segs += [(8, 12, 13.0, 100.0, V), (9, 12, 13.0, 100.0, V)]
    segs += [(10, 13, 13.0, 100.0, V), (11, 13, 13.0, 100.0, V)]
    segs += [(12, 14, 19.5, 100.0, V), (13, 14, 19.5, 100.0, V), (14, 15, 33.0, 100.0, V)]

    x = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 6, 7]
    y = [0, 0, 1.5, -1.5, 2.25, 0.75, -0.75, -2.25, 2.25, 0.75, -0.75, -2.25, 1.5, -1.5, 0, 0]
    positions = np.column_stack([x, y, np.zeros(16)]) * 100.0 * UM

    arr = np.array([s[:4] for s in segs], dtype=float)
    graph = VascularGraph(
        positions=positions,
        edges=arr[:, :2].astype(int),
        diameter=arr[:, 2] * UM,
        length=arr[:, 3] * UM,
        vessel_type=[int(s[4]) for s in segs],
        meta={"name": "suarez2021a", "species": "rodent/cat (idealised)"},
    )
    return NetworkCase(
        graph=graph,
        pressure_bc={0: p_in_mmhg * MMHG, 15: p_out_mmhg * MMHG},
        inlet_hematocrit=hematocrit,
        meta={"active_edge": 3, "passive_edge": 4, "sibling_tree_edges": [5, 6]},
    )
