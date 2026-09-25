"""Structural adaptation of vessel diameters (optional network step).

Each vessel's diameter changes in response to local signals until the
network reaches equilibrium:

    dD/dt = D * S_tot / T
    S_tot = log10(tau_w + tau_ref) - log10(tau_e(P)) + k_m * (S_down + S_up) / D - k_s

- ``tau_w`` wall shear stress (dyn/cm^2), ``P`` mean segment pressure (mmHg)
  and ``tau_e(P) = a0 + a1 / (1 + (P / a2)^a3)`` the shear stress expected
  at that pressure.
- ``S_down``: a metabolic signal added along every vessel in proportion to
  its length, carried downstream with the blood (split in proportion to
  flow), divided by (Q + Q_ref) and saturated with half-maximum ``s_down50``.
- ``S_up``: the downstream signal conducted upstream along the vessel wall
  with decay length ``conduction_length_um`` (split in proportion to
  diameter), saturated with half-maximum ``s_up50`` and maximum ``s_up_max``.
- ``k_s``: shrinking tendency. ``D`` in the metabolic terms is in um.

Model and parameter values: Alberding JP, Secomb TW 2021, "Simulation of
angiogenesis in three dimensions: application to cerebral cortex",
PLoS Comput Biol 17:e1009164, doi:10.1371/journal.pcbi.1009164, as
implemented in the authors' published code AngioAdapt20
(github.com/secomb/AngioAdapt20, AdaptParams.dat, adapt.cpp,
conductconvect.cpp; code reimplemented here, not copied). The model builds
on Pries AR, Secomb TW, Gaehtgens P 1998, Am J Physiol 275:H349,
doi:10.1152/ajpheart.1998.275.2.H349, and Pries AR, Reglin B, Secomb TW
2001, Am J Physiol Heart Circ Physiol 281:H1015,
doi:10.1152/ajpheart.2001.281.3.H1015.

Differences from the published model, stated plainly:
- The metabolic signal is uniform (``metabolic_signal`` per um of vessel)
  instead of the growth-factor concentration from hypoxic tissue; its value
  (0.1) is our calibration so that capillary diameters after adaptation
  match the measured 4.0 +/- 1.0 um (Schmid et al. 2017, PLoS Comput Biol
  13:e1005392). An oxygen-driven signal is the next step when needed.
- No pruning: diameters are floored at ``min_diameter_um`` (2.5 um, the
  lower bound of the column's capillary diameters) instead of removing
  vessels below 3 um.
- Which vessels adapt is set by ``scope``: "capillaries" (default), "microvessels"
  (everything below the penetrating trunks, including the arteriolar and
  venular offshoots) or "all". ``adapt_types`` overrides it with an explicit
  list of vessel types.
- The pressure stimulus uses the transmural pressure, blood pressure minus
  ``tissue_pressure_mmhg`` (default 5.1 mmHg, measured mouse intracranial
  pressure; see AdaptationParams).
- Flow during adaptation uses the in-vitro viscosity law without phase
  separation (fast); the final network is solved with any laws.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from ..units import MMHG, UM
from .flow import PLASMA_VISCOSITY, solve_flow
from .graph import VesselType
from .networks import NetworkCase

DYN_PER_CM2 = 0.1  # Pa


@dataclass
class AdaptationParams:
    steps: int = 200  # AngioAdapt20: 201 time steps
    time_step_days: float = 0.05  # AngioAdapt20
    time_scale_days: float = 1.0  # T (AngioAdapt20)
    pressure_shear: tuple = (100.0, -86.0, 36.0, 5.0)  # tau_e(P) coefficients (AngioAdapt20, 2020 fit)
    k_m: float = 18.0  # metabolic sensitivity (AngioAdapt20)
    k_s: float = 1.8  # shrinking tendency (AngioAdapt20)
    tau_ref_dyn_cm2: float = 0.01  # reference wall shear stress (AngioAdapt20)
    q_ref_nl_min: float = 0.1  # reference flow for the metabolic signal (AngioAdapt20)
    s_down50: float = 200.0  # half-maximum of the downstream (convected) response (AngioAdapt20)
    s_up50: float = 500.0  # half-maximum of the upstream (conducted) response (AngioAdapt20)
    s_up_max: float = 1.0  # maximum upstream response relative to downstream (AngioAdapt20)
    conduction_length_um: float = 17300.0  # decay length of the conducted response (AngioAdapt20)
    metabolic_signal: float = 0.1  # per um of vessel; calibrated to capillary diameter 4 +/- 1 um (see module doc)
    min_diameter_um: float = 2.5  # floor instead of pruning (model choice)
    tolerance: float = 1e-3  # stop when the median |S_tot| of adapting vessels falls below this
    # Only capillaries by default: precapillary arterioles carry smooth muscle
    # or ensheathing pericytes that set their diameter actively (Hill et al.
    # 2015, Neuron 87:95, doi:10.1016/j.neuron.2015.06.001) and measure ~9 um
    # (Grant et al. 2019, J Cereb Blood Flow Metab 39:411,
    # doi:10.1177/0271678X17732229); adapting them shrinks them to ~4 um.
    scope: str = "capillaries"  # see SCOPES
    adapt_types: tuple | None = None  # explicit vessel types to adapt (overrides scope)
    # Extravascular pressure for the transmural pressure: intracranial pressure
    # 5.1 +/- 1.2 mmHg in anaesthetised adult C57BL/6 mice (Feiler et al. 2010,
    # J Neurosci Methods 190:164, doi:10.1016/j.jneumeth.2010.05.005); other
    # mouse studies report 3.5-7 mmHg.
    tissue_pressure_mmhg: float = 5.1


SCOPES = {
    "capillaries": (VesselType.CAPILLARY,),
    "microvessels": (VesselType.PRECAPILLARY_ARTERIOLE, VesselType.CAPILLARY, VesselType.VENULE,
                     VesselType.ARTERIOLE, VesselType.UNCLASSIFIED),
    "all": tuple(VesselType),
}


def _signals(graph, flow, pressure, d_um, length_um, prm: AdaptationParams):
    """Downstream (convected) and upstream (conducted) responses per edge, both saturated."""
    e = graph.edges
    up = np.where(flow >= 0, e[:, 0], e[:, 1])
    dn = np.where(flow >= 0, e[:, 1], e[:, 0])
    q = np.abs(flow) * 1e12 * 60  # nL/min
    n_edges = len(flow)
    # Incoming and outgoing edges of every node, in flow direction.
    out_of = [[] for _ in range(graph.n_nodes)]
    into = [[] for _ in range(graph.n_nodes)]
    for k in range(n_edges):
        out_of[up[k]].append(k)
        into[dn[k]].append(k)
    order = np.argsort(-pressure)  # upstream nodes first (steady flow runs down the pressure)
    source = prm.metabolic_signal * length_um

    carried = np.zeros(n_edges)  # signal entering each edge at its upstream end
    for node in order:
        outs = out_of[node]
        if not outs:
            continue
        total = sum(carried[k] + source[k] for k in into[node])
        q_out = sum(q[k] for k in outs)
        for k in outs:
            carried[k] = total * q[k] / q_out if q_out > 0 else 0.0
    s = (carried + 0.5 * source) / (q + prm.q_ref_nl_min)
    down = s / (s + prm.s_down50)

    lc = prm.conduction_length_um
    decay = np.exp(-length_um / lc)
    conducted = np.zeros(n_edges)  # signal arriving at each edge's downstream end
    for node in order[::-1]:
        ins = into[node]
        if not ins:
            continue
        total = sum(conducted[k] * decay[k] + down[k] * lc * (1 - decay[k]) for k in out_of[node])
        d_in = sum(d_um[k] for k in ins)
        for k in ins:
            conducted[k] = total * d_um[k] / d_in
    s = conducted * lc / length_um * (1 - decay) + down * lc * (1 - lc / length_um * (1 - decay))
    up_resp = prm.s_up_max * s / (s + prm.s_up50)
    return down, up_resp


def adapt_diameters(case: NetworkCase, params: AdaptationParams | None = None) -> tuple[NetworkCase, dict]:
    """Adapt the diameters of ``case`` to equilibrium; return the new case and a report."""
    prm = params or AdaptationParams()
    g = case.graph
    d = g.diameter.copy()
    if prm.adapt_types is None and prm.scope not in SCOPES:
        raise ValueError(f"scope must be one of {sorted(SCOPES)}")
    types = prm.adapt_types if prm.adapt_types is not None else SCOPES[prm.scope]
    adapting = np.isin(g.vessel_type, [int(t) for t in types])
    length_um = np.maximum(g.length / UM, 1e-3)
    a0, a1, a2, a3 = prm.pressure_shear
    history = []
    converged = False
    for step in range(1, prm.steps + 1):
        gg = replace(g, diameter=d)
        sol = solve_flow(gg, case.pressure_bc, inlet_hematocrit=case.inlet_hematocrit,
                         viscosity="pries_invitro", phase_separation="none")
        tau = 32 * sol.viscosity * PLASMA_VISCOSITY * np.abs(sol.flow) / (np.pi * d ** 3) / DYN_PER_CM2
        p_mmhg = 0.5 * (sol.pressure[g.edges[:, 0]] + sol.pressure[g.edges[:, 1]]) / MMHG - prm.tissue_pressure_mmhg
        tau_e = a0 + a1 / (1 + (np.maximum(p_mmhg, 0.0) / a2) ** a3)
        d_um = d / UM
        down, up_resp = _signals(gg, sol.flow, sol.pressure, d_um, length_um, prm)
        s_tot = (np.log10(tau + prm.tau_ref_dyn_cm2) - np.log10(tau_e)
                 + prm.k_m * (down + up_resp) / d_um - prm.k_s)
        s_tot[~adapting] = 0.0
        d = np.maximum(d * (1 + s_tot * prm.time_step_days / prm.time_scale_days), prm.min_diameter_um * UM)
        residual = float(np.median(np.abs(s_tot[adapting]))) if adapting.any() else 0.0
        history.append(residual)
        if residual < prm.tolerance:
            converged = True
            break
    new_graph = replace(g, diameter=d, meta={**g.meta, "structural_adaptation": True})
    report = {"steps": step, "converged": converged, "median_abs_stimulus": history}
    return NetworkCase(new_graph, case.pressure_bc, case.inlet_hematocrit, {**case.meta, "adaptation": report}), report
