"""The synthetic mouse column against published measurements.

Counted as the papers count: per branch (vessel between branch points), with
capillaries the vessels at most 7 um wide (Ji et al. 2021). Targets:
capillary length density 0.88 ± 0.17 m/mm^3 and tortuosity 1.27 (Ji et al.
2021), capillary diameter 4.0 ± 1.0 um (Schmid et al. 2017), median
capillary segment ~50 um and triads 0.93 of branch points (Blinder et al.
2013), venules outnumbering arterioles ~3:1 (Blinder et al. 2013),
capillaries 0.8 ± 0.2 of vascular volume and mean branch order 3.4 (Ji et
al. 2021), no strong laminar variation (Tsai et al. 2009).

Known gaps, asserted loosely and documented in docs/networks.md: segments
~60 um (a little long), arteriole-to-venule path ~9 branches (~7 measured),
and perfusion (not tested here) well below the measured value.
"""

import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.vascular import solve_flow
from neurovascularsim.vascular.graph import VesselType
from neurovascularsim.vascular.stats import capillary_branch_order, contract_branches, network_statistics


@pytest.fixture(scope="module")
def column():
    return registry.create("network", "mouse_cortex_synthetic", seed=3)


@pytest.fixture(scope="module")
def small():
    return registry.create("network", "mouse_cortex_synthetic", size_x_um=300, size_y_um=300, depth_um=600,
                           pa_density_per_mm2=20, seed=1)


@pytest.fixture(scope="module")
def branches(column):
    return contract_branches(column.graph)


def test_capillary_bed_matches_measurements(column, branches):
    s = network_statistics(branches)
    cap = s["capillary"]
    assert 0.85 <= cap["length_density_m_per_mm3"] <= 0.95
    assert 3.7 <= cap["diameter_um"]["median"] <= 4.3
    assert 45 <= cap["length_um"]["median"] <= 70  # measured 50
    assert 1.2 <= cap["tortuosity_mean"] <= 1.35  # measured 1.27 ± 0.05
    assert 0.6 <= cap["volume_fraction"] / s["vascular_volume_fraction"] <= 1.0  # measured 0.8 ± 0.2
    n_with_degree = np.bincount(np.bincount(column.graph.edges.ravel()))
    assert n_with_degree[3] / n_with_degree[3:].sum() > 0.9  # triads among branch points (0.93 measured)


def test_capillary_topology_matches_ji_2021(branches):
    bo = capillary_branch_order(branches)
    assert 2.9 <= bo["mean_order_nearest"] <= 3.9
    assert 5 <= bo["median_arterial_to_venous_path"] <= 11


def test_capillary_density_varies_little_across_layers(branches):
    by_layer = network_statistics(branches)["capillary_length_density_by_layer"]
    assert max(by_layer.values()) / min(by_layer.values()) < 1.25


def test_branch_contraction_keeps_length_and_merges_chains():
    from neurovascularsim.vascular.graph import VascularGraph

    # A path 0-1-2 (1 has degree 2) plus a branch point 2 -> 3, 4.
    g = VascularGraph(
        positions=np.array([[0, 0, 0], [10, 5, 0], [20, 0, 0], [30, 0, 0], [20, 10, 0]]) * 1e-6,
        edges=np.array([[0, 1], [1, 2], [2, 3], [2, 4]]),
        diameter=np.array([4, 6, 8, 5]) * 1e-6,
        length=np.array([12, 12, 10, 10]) * 1e-6,
        vessel_type=np.array([VesselType.CAPILLARY] * 2 + [VesselType.VENULE] * 2),
    )
    b = contract_branches(g)
    assert b.n_edges == 3
    assert b.length.sum() == pytest.approx(g.length.sum())
    merged = np.argmax(b.length)
    assert b.length[merged] == pytest.approx(24e-6) and b.diameter[merged] == pytest.approx(5e-6)
    assert b.vessel_type[merged] == VesselType.CAPILLARY
    # Ji's definition: at most 7 um wide is capillary, whatever the label.
    assert sorted(b.vessel_type.tolist()) == sorted([VesselType.CAPILLARY, VesselType.VENULE, VesselType.CAPILLARY])


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


def test_branches_per_trunk_limits_connections():
    """pa/av_branches_per_trunk set how many levels of each trunk connect to the bed."""
    def connectors(**kw):
        g = registry.create("network", "mouse_cortex_synthetic", size_x_um=300, size_y_um=300, depth_um=600,
                            seed=4, pa_min_depth_fraction=1.0, **kw).graph
        trunk_nodes = set(g.edges[g.vessel_type == VesselType.PENETRATING_ARTERIOLE].ravel().tolist())
        n_pa = int(np.sum(g.depth[list(trunk_nodes)] == 0))
        pre = g.edges[g.vessel_type == VesselType.PRECAPILLARY_ARTERIOLE]
        return n_pa, sum(1 for a, b in pre if (a in trunk_nodes) != (b in trunk_nodes))

    n_pa, every_level = connectors()
    _, three = connectors(pa_branches_per_trunk=3)
    assert three <= n_pa * 4  # 3 levels, the deepest with one extra branch
    assert three < every_level


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


def test_tissue_to_vessel_distance_matches_ji_2021():
    """Mean tissue-to-vessel distance 13.3 +/- 1.2 um at 0.88 m/mm^3 (Ji et al. 2021)."""
    from neurovascularsim.vascular.stats import tissue_vessel_distance

    g = registry.create("network", "mouse_cortex_synthetic", size_x_um=400, size_y_um=400, depth_um=800, seed=2).graph
    d = tissue_vessel_distance(g, n_samples=5000)
    assert 11.0 < d["mean_um"] < 16.0
    assert tissue_vessel_distance(registry.create("network", "suarez2021a").graph) is None  # planar


def test_perfusion_with_invitro_viscosity_matches_measurements(column):
    """With measured morphology and the in-vitro law, cortical perfusion is
    near the measured ~100 mL/100 g/min (the in-vivo law gives ~20; see
    docs/networks.md)."""
    g = column.graph
    sol = solve_flow(g, column.pressure_bc, inlet_hematocrit=0.45, viscosity="pries_invitro", phase_separation="none")
    inflow = sum(np.abs(sol.flow[(g.edges == n).any(axis=1)]).sum() for n in column.meta["sources"])
    perfusion = inflow * 6e7 / (g.meta["volume_mm3"] * 1e-3 * 1.05) * 100  # mL / 100 g / min
    assert 60 < perfusion < 150


def test_structural_adaptation_evens_out_capillary_flow():
    """Adaptation (Alberding & Secomb 2021) converges, keeps trunks fixed,
    keeps capillaries near the measured 4 +/- 1 um and lowers the spread of
    capillary speeds."""
    kw = dict(size_x_um=300, size_y_um=300, depth_um=600, seed=4)
    before = registry.create("network", "mouse_cortex_synthetic", **kw)
    after = registry.create("network", "mouse_cortex_synthetic", structural_adaptation=True, **kw)
    assert after.meta["adaptation"]["converged"]
    trunks = np.isin(before.graph.vessel_type, [VesselType.PENETRATING_ARTERIOLE, VesselType.ASCENDING_VENULE])
    np.testing.assert_allclose(after.graph.diameter[trunks], before.graph.diameter[trunks])
    cap = before.graph.vessel_type == VesselType.CAPILLARY
    assert 3.0 < after.graph.diameter[cap].mean() * 1e6 < 5.5

    def speed_cv(case):
        sol = solve_flow(case.graph, case.pressure_bc, viscosity="pries_invitro")
        v = np.abs(sol.flow[cap]) / (np.pi * (case.graph.diameter[cap] / 2) ** 2)
        return v.std() / v.mean()

    assert speed_cv(after) < speed_cv(before)


def test_adaptation_scope_and_tissue_pressure():
    from neurovascularsim.vascular.adaptation import AdaptationParams, adapt_diameters

    case = registry.create("network", "mouse_cortex_synthetic", size_x_um=250, size_y_um=250, depth_um=400, seed=7)
    g = case.graph
    offshoots = np.isin(g.vessel_type, [VesselType.PRECAPILLARY_ARTERIOLE, VesselType.VENULE])
    caps_only, _ = adapt_diameters(case, AdaptationParams(steps=40))
    np.testing.assert_allclose(caps_only.graph.diameter[offshoots], g.diameter[offshoots])
    micro, _ = adapt_diameters(case, AdaptationParams(steps=40, scope="microvessels"))
    assert not np.allclose(micro.graph.diameter[offshoots], g.diameter[offshoots])
    # Tissue pressure lowers the transmural pressure and so changes the equilibrium.
    icp, _ = adapt_diameters(case, AdaptationParams(steps=40, tissue_pressure_mmhg=8.0))
    assert not np.allclose(icp.graph.diameter, caps_only.graph.diameter)
    with pytest.raises(ValueError):
        adapt_diameters(case, AdaptationParams(scope="bogus"))


def test_growth_factor_follows_tissue_po2():
    """GF (Alberding & Secomb 2021) is 1 in anoxic tissue, f(PO2) in uniform tissue, and decays away from hypoxia."""
    from neurovascularsim.vascular.adaptation import AdaptationParams, growth_factor

    prm = AdaptationParams()
    voxel = 10e-6
    np.testing.assert_allclose(growth_factor(np.zeros((6, 6, 6)), voxel, prm), 1.0, atol=1e-6)
    np.testing.assert_allclose(growth_factor(np.full((6, 6, 6), 40.0), voxel, prm), 0.5, atol=1e-6)
    po2 = np.full((40, 3, 3), 60.0)
    po2[:2] = 0.0  # hypoxic slab at one end
    c = growth_factor(po2, voxel, prm)[:, 1, 1]
    assert c[0] > c[10] > c[30] > 0
    assert np.all(np.diff(c) <= 1e-12)


def test_oxygen_driven_adaptation_runs():
    """The oxygen source converges on a small column and reports its oxygen solves."""
    from neurovascularsim.vascular.adaptation import AdaptationParams, adapt_diameters
    from neurovascularsim.vascular.oxygen import OxygenParams

    case = registry.create("network", "mouse_cortex_synthetic", size_x_um=200, size_y_um=200, depth_um=400, seed=1)
    adapted, report = adapt_diameters(case, AdaptationParams(
        metabolic_source="oxygen", oxygen_update_steps=10, oxygen=OxygenParams(voxel_um=20.0)))
    assert report["converged"] and report["oxygen_solves"] >= 2
    assert 0 < report["mean_metabolic_source_per_um"] < 1
    cap = case.graph.vessel_type == VesselType.CAPILLARY
    assert not np.allclose(adapted.graph.diameter[cap], case.graph.diameter[cap])
    with pytest.raises(ValueError):
        adapt_diameters(case, AdaptationParams(metabolic_source="bogus"))
