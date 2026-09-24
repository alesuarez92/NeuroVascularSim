"""Regression against Suarez et al. 2021, J Theor Biol 529:110856.

The paper dilates one daughter arteriole by about 30% and reports: ~10%
more CBF in it, arterial blood stealing from its sibling driven by phase
separation (stealing ratio 27.4% at Hct 0.32 to 23.3% at Hct 0.50), almost
no stealing with hematocrit held constant, and a small flow gain in the
other half of the tree.

This steady-state reproduction gives the same qualitative results. It is
somewhat larger in size (CBF gain ~13%, stealing ratio ~31%), probably
because the paper reports a transient peak and some Table A1 details were
not legible in the manuscript. The bounds below record that; tighten them
once the original code is available.
"""

import pytest

from neurovascularsim import registry
from neurovascularsim.vascular import solve_flow


def dilate(hematocrit, phase, factor=1.3):
    case = registry.create("network", "suarez2021a", hematocrit=hematocrit)
    g, a, p = case.graph, case.meta["active_edge"], case.meta["passive_edge"]
    base = solve_flow(g, case.pressure_bc, inlet_hematocrit=hematocrit, phase_separation=phase)
    d = g.diameter.copy()
    d[a] *= factor
    act = solve_flow(g.with_diameter(d), case.pressure_bc, inlet_hematocrit=hematocrit,
                     phase_separation=phase)
    fa = act.flow[a] / base.flow[a]
    fp = act.flow[p] / base.flow[p]
    sibling = act.flow[case.meta["sibling_tree_edges"]] / base.flow[case.meta["sibling_tree_edges"]]
    return fa, fp, (1 - fp) / (fa - 1), sibling


def test_active_arteriole_gain_is_modest():
    fa, _, _, _ = dilate(0.45, "pries")
    assert 1.08 < fa < 1.15


def test_stealing_needs_phase_separation():
    _, _, sr_pries, _ = dilate(0.45, "pries")
    _, _, sr_none, _ = dilate(0.45, "none")
    assert sr_none < 0.05
    assert 0.20 < sr_pries < 0.40
    assert sr_pries > 5 * sr_none


def test_stealing_decreases_with_hematocrit():
    ratios = [dilate(h, "pries")[2] for h in (0.32, 0.45, 0.50)]
    assert ratios[0] > ratios[1] > ratios[2]


def test_other_half_of_tree_gains_flow():
    *_, sibling = dilate(0.45, "pries")
    assert all(s > 1.0 for s in sibling)


def test_inlet_pressure_has_no_effect_on_relative_changes():
    # Poiseuille flow is linear in pressure and phase separation depends only
    # on flow fractions, so relative changes cannot depend on the pressure scale.
    ref = dilate(0.45, "pries")[2]
    case = registry.create("network", "suarez2021a", p_in_mmhg=70.0)
    g, a, p = case.graph, case.meta["active_edge"], case.meta["passive_edge"]
    base = solve_flow(g, case.pressure_bc)
    d = g.diameter.copy()
    d[a] *= 1.3
    act = solve_flow(g.with_diameter(d), case.pressure_bc)
    fa, fp = act.flow[a] / base.flow[a], act.flow[p] / base.flow[p]
    assert (1 - fp) / (fa - 1) == pytest.approx(ref, rel=1e-6)
