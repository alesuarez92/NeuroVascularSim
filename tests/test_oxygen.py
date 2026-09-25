"""Oxygen transport and BOLD on a small synthetic column: conservation,
limits with known answers, and the expected directions of change."""

import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.experiment import ExperimentSpec, run_experiment
from neurovascularsim.vascular import solve_flow
from neurovascularsim.vascular.bold import BoldParams, bold_profile
from neurovascularsim.vascular.graph import VesselType
from neurovascularsim.vascular.oxygen import OxygenParams, saturation, solve_oxygen

SMALL = dict(size_x_um=250, size_y_um=250, depth_um=500, pa_density_per_mm2=40, seed=2)


@pytest.fixture(scope="module")
def column():
    case = registry.create("network", "mouse_cortex_synthetic", **SMALL)
    flow = solve_flow(case.graph, case.pressure_bc, viscosity="pries_invitro", phase_separation="none")
    return case, flow


def venous_so2(case, ox):
    g = case.graph
    sinks = case.meta["sinks"]
    m = np.isin(g.edges, sinks).any(axis=1)
    return float(np.mean(ox.so2[m]))


def test_hill_curve():
    p = OxygenParams()
    assert saturation(p.p50_mmhg, p.p50_mmhg, p.hill_n) == pytest.approx(0.5)
    assert saturation(100.0, 40.2, 2.59) == pytest.approx(0.914, abs=1e-3)


def test_no_consumption_means_arterial_po2_everywhere(column):
    case, flow = column
    ox = solve_oxygen(case.graph, flow, OxygenParams(cmro2_umol_per_g_min=0.0), inlet_nodes=case.meta["sources"])
    assert ox.converged
    assert np.allclose(ox.po2, 100.0, atol=1.0)  # iteration tolerance; the exact answer is 100
    assert np.allclose(ox.tissue_po2, 100.0, atol=1.0)


def test_oxygen_is_conserved_and_physiological(column):
    case, flow = column
    ox = solve_oxygen(case.graph, flow, inlet_nodes=case.meta["sources"])
    s = ox.summary
    assert ox.converged
    assert s["o2_balance"] == pytest.approx(1.0, abs=0.02)  # delivered by blood = consumed by tissue
    assert 0.02 < s["oef"] < 0.9
    art = np.isin(case.graph.vessel_type, [VesselType.PENETRATING_ARTERIOLE])
    cap = case.graph.vessel_type == VesselType.CAPILLARY
    assert np.median(ox.po2[art]) > np.median(ox.po2[cap])  # oxygen falls along the path
    assert np.all((ox.tissue_po2 >= 0) & (ox.tissue_po2 <= 100.0 + 1e-6))


def test_more_consumption_lowers_venous_saturation_more_flow_raises_it(column):
    case, flow = column
    base = solve_oxygen(case.graph, flow, inlet_nodes=case.meta["sources"])
    hungry = solve_oxygen(case.graph, flow, cmro2_scales=[{"factor": 1.5}], inlet_nodes=case.meta["sources"])
    assert venous_so2(case, hungry) < venous_so2(case, base)
    dilated = registry.create("perturbation", "scale_diameter", vessel_types=["PENETRATING_ARTERIOLE"], factor=1.3)(case)
    flow2 = solve_flow(dilated.graph, dilated.pressure_bc, viscosity="pries_invitro", phase_separation="none")
    more = solve_oxygen(dilated.graph, flow2, inlet_nodes=case.meta["sources"])
    assert venous_so2(case, more) > venous_so2(case, base)


def test_bold_rises_with_oxygenation_and_blood_volume_effects():
    g = registry.create("network", "mouse_cortex_synthetic", **SMALL).graph
    so2 = np.full(g.n_edges, 0.7)
    same = bold_profile(g, g.diameter, so2, g.diameter, so2)
    assert same["column_signal_change_pct"] == pytest.approx(0.0, abs=1e-12)
    up = bold_profile(g, g.diameter, so2, g.diameter, np.full(g.n_edges, 0.8), BoldParams(field_t=7.0, r0_per_s=228))
    assert up["column_signal_change_pct"] > 0
    assert all(x >= 0 for x in up["signal_change_pct"])
    # Higher field, stronger extravascular effect.
    low = bold_profile(g, g.diameter, so2, g.diameter, np.full(g.n_edges, 0.8), BoldParams(field_t=1.5, r0_per_s=0.0))
    high = bold_profile(g, g.diameter, so2, g.diameter, np.full(g.n_edges, 0.8), BoldParams(field_t=7.0, r0_per_s=0.0))
    assert high["column_signal_change_pct"] > low["column_signal_change_pct"]


def test_experiment_with_oxygen_and_bold():
    """More flow gives positive BOLD; more consumption at the same flow, negative BOLD."""
    spec = ExperimentSpec.from_dict({
        "name": "activation",
        "network": {"name": "mouse_cortex_synthetic", "params": SMALL},
        "solver": {"viscosity": "pries_invitro", "phase_separation": "none"},
        "oxygen": {},
        "bold": {"field_t": 7.0, "te_ms": 25.0, "r0_per_s": 228.0},
        "conditions": [
            {"label": "dilation", "perturbations": [
                {"name": "scale_diameter", "params": {"vessel_types": ["PENETRATING_ARTERIOLE"], "factor": 1.2}}]},
            {"label": "consumption", "perturbations": [{"name": "scale_cmro2", "params": {"factor": 1.1}}]},
        ],
        "spec_version": 1,
    })
    record = run_experiment(spec)
    base = record.results["baseline"]
    assert len(base["so2"]) == len(base["flow"]) and "tissue_slice" in base
    assert record.results["consumption"]["oxygen"]["cmro2_umol_per_g_min"] > base["oxygen"]["cmro2_umol_per_g_min"]
    dil, con = record.summary["dilation"]["bold"], record.summary["consumption"]["bold"]
    assert dil["column_signal_change_pct"] > 0
    assert con["column_signal_change_pct"] < 0
    assert len(dil["depth_um"]) == len(dil["signal_change_pct"])


def test_bold_needs_oxygen():
    with pytest.raises(ValueError):
        ExperimentSpec.from_dict({"name": "x", "network": {"name": "suarez2021a"}, "bold": {}}).validate()
    with pytest.raises(ValueError):
        ExperimentSpec.from_dict({"name": "x", "network": {"name": "suarez2021a"}, "oxygen": {"nope": 1}}).validate()
