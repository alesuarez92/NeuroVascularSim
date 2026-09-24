import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.units import MMHG, PLASMA_VISCOSITY, UM
from neurovascularsim.vascular import VascularGraph, VesselType, solve_flow
from neurovascularsim.vascular.flow import poiseuille_resistance


def line_graph(diameters_um, lengths_um):
    n = len(diameters_um)
    return VascularGraph(
        positions=np.column_stack([np.arange(n + 1), np.zeros(n + 1), np.zeros(n + 1)]) * UM,
        edges=[(i, i + 1) for i in range(n)],
        diameter=np.array(diameters_um) * UM,
        length=np.array(lengths_um) * UM,
        vessel_type=[VesselType.ARTERIOLE] * n,
    )


def test_single_tube_matches_poiseuille():
    g = line_graph([10.0], [200.0])
    dp = 10 * MMHG
    sol = solve_flow(g, {0: dp, 1: 0.0}, viscosity="constant")
    expected = dp * np.pi * (10 * UM) ** 4 / (128 * PLASMA_VISCOSITY * 200 * UM)
    assert sol.flow[0] == pytest.approx(expected, rel=1e-12)


def test_series_resistances_add():
    g = line_graph([10.0, 20.0], [100.0, 300.0])
    sol = solve_flow(g, {0: 1000.0, 2: 0.0}, viscosity="constant")
    r = poiseuille_resistance(g.diameter, g.length, 1.0)
    assert sol.flow[0] == pytest.approx(1000.0 / r.sum())
    assert sol.flow[1] == pytest.approx(sol.flow[0])


def test_parallel_branches_split_by_conductance():
    g = VascularGraph(
        positions=np.zeros((2, 3)),
        edges=[(0, 1), (0, 1)],
        diameter=np.array([10.0, 20.0]) * UM,
        length=np.array([100.0, 100.0]) * UM,
        vessel_type=[VesselType.CAPILLARY] * 2,
    )
    sol = solve_flow(g, {0: 1000.0, 1: 0.0}, viscosity="constant")
    assert sol.flow[1] / sol.flow[0] == pytest.approx(16.0)


def test_flow_sign_follows_edge_orientation():
    g = line_graph([10.0], [100.0])
    sol = solve_flow(g, {0: 0.0, 1: 1000.0}, viscosity="constant")
    assert sol.flow[0] < 0


def test_missing_boundary_condition_is_an_error():
    g = line_graph([10.0], [100.0])
    with pytest.raises(ValueError):
        solve_flow(g, {})


def _node_balance(graph, values, fixed):
    net = np.zeros(graph.n_nodes)
    np.add.at(net, graph.edges[:, 0], -values)
    np.add.at(net, graph.edges[:, 1], values)
    internal = np.setdiff1d(np.arange(graph.n_nodes), list(fixed))
    return net[internal]


@pytest.mark.parametrize("phase", ["pries", "none"])
def test_blood_and_red_cells_are_conserved(phase):
    case = registry.create("network", "suarez2021a")
    d = case.graph.diameter.copy()
    d[case.meta["active_edge"]] *= 1.3
    g = case.graph.with_diameter(d)
    sol = solve_flow(g, case.pressure_bc, phase_separation=phase)
    assert sol.converged
    scale = np.abs(sol.flow).max()
    assert np.abs(_node_balance(g, sol.flow, case.pressure_bc)).max() < 1e-9 * scale
    rbc = sol.flow * sol.hematocrit
    assert np.abs(_node_balance(g, rbc, case.pressure_bc)).max() < 1e-6 * scale


def test_symmetric_network_keeps_uniform_hematocrit():
    case = registry.create("network", "suarez2021a")
    sol = solve_flow(case.graph, case.pressure_bc)
    np.testing.assert_allclose(sol.hematocrit, 0.45, atol=1e-9)
