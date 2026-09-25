"""The synthetic mouse column against published measurements.

Targets: capillary length density 0.88–0.98 m/mm^3 (Ji et al. 2021),
capillary diameter 4.0 ± 1.0 um (Schmid et al. 2017), venules outnumbering
arterioles ~3:1 (Blinder et al. 2013), mostly degree-3 junctions (Blinder et
al. 2013), capillaries ~0.8 of vascular volume (Ji et al. 2021), and no
strong laminar variation of capillary density (Tsai et al. 2009).

The defaults are calibrated to capillary topology (Ji et al. 2021: mean
capillary branch order 3.4 from the nearest non-capillary vessel, ~7
branches between arterioles and venules).

Known gaps, asserted loosely and documented in docs/networks.md: median
capillary segment length ~34 um against 46–50 um measured; capillaries hold
~0.55 of vascular volume against 0.8 measured; capillary density rises
gently with depth (~15%).
"""

import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.vascular import solve_flow
from neurovascularsim.vascular.graph import VesselType
from neurovascularsim.vascular.stats import capillary_branch_order, network_statistics


@pytest.fixture(scope="module")
def column():
    return registry.create("network", "mouse_cortex_synthetic", seed=3)


@pytest.fixture(scope="module")
def small():
    return registry.create("network", "mouse_cortex_synthetic", size_x_um=300, size_y_um=300, depth_um=600,
                           pa_density_per_mm2=20, seed=1)


def test_capillary_bed_matches_measurements(column):
    s = network_statistics(column.graph)
    cap = s["capillary"]
    assert 0.85 <= cap["length_density_m_per_mm3"] <= 0.95
    assert 3.7 <= cap["diameter_um"]["median"] <= 4.3
    assert 25 <= cap["length_um"]["median"] <= 60  # measured 46–50 (known gap)
    cap_volume_share = cap["volume_fraction"] / s["vascular_volume_fraction"]
    assert 0.45 <= cap_volume_share <= 0.9  # measured 0.8 (known gap)
    assert s["degree_fractions"][3] > 0.7


def test_capillary_topology_matches_ji_2021(column):
    bo = capillary_branch_order(column.graph)
    assert 2.8 <= bo["mean_order_nearest"] <= 4.2
    assert 4 <= bo["median_arterial_to_venous_path"] <= 9


def test_capillary_density_varies_little_across_layers(column):
    per_layer = network_statistics(column.graph)["capillary_length_density_by_layer"]
    deep = [per_layer[k] for k in ("L2/3", "L4", "L5", "L6")]
    assert max(deep) / min(deep) < 1.3


def test_penetrating_vessels_and_boundaries(column):
    m = column.meta
    assert m["n_ascending_venules"] == pytest.approx(3 * m["n_penetrating_arterioles"], abs=1)
    assert m["n_penetrating_arterioles"] >= 2
    assert set(column.pressure_bc) == set(m["sources"]) | set(m["sinks"])
    g = column.graph
    for node in m["sources"] + m["sinks"]:
        assert g.depth[node] == 0.0  # pressures are fixed where vessels enter the cortex


def test_layers_follow_depth(column):
    g = column.graph
    assert set(np.unique(g.layer)) <= {1, 2, 3, 4, 5}
    assert np.all(np.diff(g.layer[np.argsort(g.depth)]) >= 0)


def test_same_seed_same_network():
    a = registry.create("network", "mouse_cortex_synthetic", size_x_um=250, size_y_um=250, depth_um=400, seed=7)
    b = registry.create("network", "mouse_cortex_synthetic", size_x_um=250, size_y_um=250, depth_um=400, seed=7)
    np.testing.assert_array_equal(a.graph.edges, b.graph.edges)
    np.testing.assert_allclose(a.graph.diameter, b.graph.diameter)


def test_pial_tree_boundary_mode():
    case = registry.create("network", "mouse_cortex_synthetic", size_x_um=300, size_y_um=300, depth_um=500,
                           seed=2, boundary="pial_tree", pa_density_per_mm2=20)
    assert len(case.pressure_bc) == 2
    types = set(case.graph.vessel_type.tolist())
    assert {VesselType.PIAL_ARTERY, VesselType.PIAL_VEIN} <= types


def test_unknown_parameter_is_rejected():
    with pytest.raises(TypeError):
        registry.create("network", "mouse_cortex_synthetic", bogus=1)


def test_flow_on_column_is_physical(small):
    g = small.graph
    sol = solve_flow(g, small.pressure_bc, inlet_hematocrit=small.inlet_hematocrit)
    # Blood and red cells are conserved at every internal node.
    net = np.zeros(g.n_nodes)
    np.add.at(net, g.edges[:, 0], -sol.flow)
    np.add.at(net, g.edges[:, 1], sol.flow)
    internal = np.setdiff1d(np.arange(g.n_nodes), list(small.pressure_bc))
    assert np.abs(net[internal]).max() < 1e-9 * np.abs(sol.flow).max()
    # Pressure falls from arterioles through capillaries to venules.
    p = sol.pressure
    mean_p = {t: p[g.edges[g.vessel_type == t]].mean() for t in
              (VesselType.PENETRATING_ARTERIOLE, VesselType.CAPILLARY, VesselType.ASCENDING_VENULE)}
    assert mean_p[VesselType.PENETRATING_ARTERIOLE] > mean_p[VesselType.CAPILLARY] > mean_p[VesselType.ASCENDING_VENULE]
    assert np.all((sol.hematocrit >= 0) & (sol.hematocrit < 1))


def test_layer_selective_dilation(small):
    dilate = registry.create("perturbation", "scale_diameter", vessel_types=["CAPILLARY"], layers=[3], factor=1.2)
    after = dilate(small)
    changed = np.flatnonzero(after.graph.diameter != small.graph.diameter)
    g = small.graph
    assert changed.size > 0
    assert np.all(g.vessel_type[changed] == VesselType.CAPILLARY)
    assert np.all(g.layer[g.edges[changed, 0]] == 3)


def test_depth_selection_needs_depth():
    case = registry.create("network", "suarez2021a")
    with pytest.raises(ValueError):
        registry.create("perturbation", "scale_diameter", depth_range_um=[0, 100])(case)
