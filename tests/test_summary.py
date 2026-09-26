"""Mesoscopic summaries of a flow solution (column, layer, depth bins)."""
import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.experiment import ExperimentSpec, run_experiment
from neurovascularsim.vascular.cortex import MouseColumnParams
from neurovascularsim.vascular.flow import solve_flow
from neurovascularsim.vascular.summary import flow_summary


@pytest.fixture(scope="module")
def solved():
    case = registry.create("network", "mouse_cortex_synthetic", size_x_um=300, size_y_um=300, depth_um=600, seed=1)
    sol = solve_flow(case.graph, case.pressure_bc, viscosity="pries_invitro")
    return case, sol


def summarise(case, sol, resolution, **kw):
    return flow_summary(case.graph, sol.flow, sol.hematocrit, sol.pressure, case.pressure_bc, resolution, **kw)


def test_column_inflow_is_the_flow_through_the_sources(solved):
    case, sol = solved
    g = case.graph
    col = summarise(case, sol, "column")["column"]
    expected = sum(np.abs(sol.flow[(g.edges == n).any(axis=1)]).sum() for n in case.meta["sources"])
    assert col["inflow_nl_s"] == pytest.approx(expected * 1e12, rel=1e-9)
    assert col["inlet_pressure_mean_mmhg"] == pytest.approx(MouseColumnParams().p_in_mmhg)
    assert col["outlet_pressure_mean_mmhg"] == pytest.approx(10.0)


@pytest.mark.parametrize("resolution", ["layer", "depth"])
def test_regions_add_up_to_the_column(solved, resolution):
    """Slab blood volumes, weighted by slab tissue volume, add up to the column's."""
    case, sol = solved
    col = summarise(case, sol, "column")["regions"]["column"]
    regions = summarise(case, sol, resolution, bin_um=150.0)["regions"]
    assert sum(r["n_capillaries"] for r in regions.values()) == col["n_capillaries"]
    depth_um = case.graph.depth.max() * 1e6
    names = list(regions)
    if resolution == "depth":
        widths = [min(150.0, depth_um - 150.0 * i) for i in range(len(names))]
    else:
        from neurovascularsim.vascular.cortex import LAYER_BOUNDS_UM, LAYER_NAMES
        b = {n: (lo, hi) for n, lo, hi in zip(LAYER_NAMES, LAYER_BOUNDS_UM[:-1], LAYER_BOUNDS_UM[1:])}
        widths = [min(b[n][1], depth_um) - b[n][0] for n in names]
    total = sum(regions[n]["blood_volume_fraction"] * w for n, w in zip(names, widths)) / depth_um
    assert total == pytest.approx(col["blood_volume_fraction"], rel=0.02)


def test_network_without_depth_has_only_a_column_summary():
    case = registry.create("network", "suarez2021a")
    sol = solve_flow(case.graph, case.pressure_bc)
    out = summarise(case, sol, "layer")
    assert list(out["regions"]) == ["column"]


def test_runs_store_the_summaries():
    spec = ExperimentSpec.from_dict({
        "name": "summary test",
        "network": {"name": "mouse_cortex_synthetic",
                    "params": {"size_x_um": 250, "size_y_um": 250, "depth_um": 400, "seed": 2}},
    })
    rec = run_experiment(spec)
    meso = rec.results["baseline"]["mesoscopic"]
    assert set(meso) == {"column", "layer"}
    assert meso["column"]["column"]["inflow_nl_s"] > 0
