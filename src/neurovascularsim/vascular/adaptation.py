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

Metabolic signal source, set by ``metabolic_source``:
- "uniform" (default): ``metabolic_signal`` per um of vessel everywhere. This
  differs from the published model; the value (0.1) is our calibration so
  that capillary diameters after adaptation match the measured 4.0 +/- 1.0 um
  (Schmid et al. 2017, PLoS Comput Biol 13:e1005392).
- "oxygen": the published mechanism. Hypoxic tissue releases a growth factor
  (GF) at rate M_GF / (1 + (PO2 / P_GF)^N_GF); it diffuses and decays
  (steady -D lap C + K C = production), and each vessel takes up
  ``gf_permeability`` * C_GF (at its midpoint) per um of length as its
  metabolic source. Tissue PO2 comes from vascular/oxygen.py, re-solved every
  ``oxygen_update_steps`` steps (warm-started). Values from AngioAdapt20
  (SoluteParams.dat, tissrate.cpp, conductconvect.cpp): D_GF = 2e-7 cm^2/s,
  K_GF = M_GF = 8e-3 /s (so C_GF is 1 at PO2 = 0 and only the length
  sqrt(D/K) = 50 um matters), P_GF = 40 mmHg, N_GF = 2.5, k_GF = 1. The
  authors state that these were fitted to their simulation criteria (tissue
  PO2, vessel density, oxygen extraction), not measured: "Parameter values
  for GF transport ... are not generally available" (Alberding & Secomb
  2021). Differences: GF diffuses on the oxygen grid with no-flux faces
  (they use a Green's function with mirror and periodic images).

Other differences from the published model, stated plainly:
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
from .oxygen import OxygenParams
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
    metabolic_source: str = "uniform"  # "uniform" or "oxygen" (see module doc)
    # Oxygen-driven growth factor (AngioAdapt20, fitted by Alberding & Secomb 2021; see module doc).
    gf_decay_length_um: float = 50.0  # sqrt(D_GF / K_GF) = sqrt(20 um^2/s / 8e-3 /s)
    gf_p50_mmhg: float = 40.0  # P_GF, PO2 of half-maximal GF release
    gf_hill_n: float = 2.5  # N_GF
    gf_permeability: float = 1.0  # k_GF, metabolic source per um per unit GF concentration
    oxygen_update_steps: int = 20  # re-solve tissue PO2 every this many steps (model choice: cost)
    oxygen: OxygenParams | None = None  # oxygen transport for the "oxygen" source (default OxygenParams())
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


METABOLIC_SOURCES = ("uniform", "oxygen")


def growth_factor(tissue_po2: np.ndarray, voxel_m: float, prm: AdaptationParams) -> np.ndarray:
    """Steady GF concentration (0..1) on the oxygen grid: (-lap + 1/L^2) C = f(PO2) / L^2, no-flux faces."""
    from scipy.sparse import identity
    from scipy.sparse.linalg import cg

    from .oxygen import neg_laplacian

    shape = tissue_po2.shape
    lam2 = 1.0 / (prm.gf_decay_length_um * UM) ** 2
    release = 1.0 / (1.0 + (np.maximum(tissue_po2.ravel(), 0.0) / prm.gf_p50_mmhg) ** prm.gf_hill_n)
    a = (neg_laplacian(shape, voxel_m) + lam2 * identity(int(np.prod(shape)))).tocsr()
    c, _ = cg(a, lam2 * release, x0=release, rtol=1e-8, maxiter=2000)
    return np.clip(c, 0.0, 1.0).reshape(shape)


def _oxygen_source(graph, flow_sol, prm: AdaptationParams, tissue0, inlet_nodes=None):
    """Metabolic source per um of each vessel from the GF at its midpoint; also the oxygen solution."""
    from .oxygen import solve_oxygen

    oxy = solve_oxygen(graph, flow_sol, prm.oxygen or OxygenParams(), inlet_nodes=inlet_nodes,
                       initial_tissue_po2=tissue0)
    gf = growth_factor(oxy.tissue_po2, oxy.voxel, prm)
    mid = 0.5 * (graph.positions[graph.edges[:, 0]] + graph.positions[graph.edges[:, 1]])
    ijk = np.floor((mid - oxy.grid_origin) / oxy.voxel).astype(np.int64)
    for i in range(3):
        np.clip(ijk[:, i], 0, gf.shape[i] - 1, out=ijk[:, i])
    return prm.gf_permeability * gf[tuple(ijk.T)], oxy


def _signals(graph, flow, pressure, d_um, length_um, prm: AdaptationParams, source_per_um):
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
    source = source_per_um * length_um

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
    if prm.metabolic_source not in METABOLIC_SOURCES:
        raise ValueError(f"metabolic_source must be one of {list(METABOLIC_SOURCES)}")
    types = prm.adapt_types if prm.adapt_types is not None else SCOPES[prm.scope]
    adapting = np.isin(g.vessel_type, [int(t) for t in types])
    length_um = np.maximum(g.length / UM, 1e-3)
    a0, a1, a2, a3 = prm.pressure_shear
    history = []
    converged = False
    source_per_um = np.full(g.n_edges, prm.metabolic_signal)
    oxy = None
    oxygen_solves = 0
    refresh = prm.metabolic_source == "oxygen"
    for step in range(1, prm.steps + 1):
        gg = replace(g, diameter=d)
        sol = solve_flow(gg, case.pressure_bc, inlet_hematocrit=case.inlet_hematocrit,
                         viscosity="pries_invitro", phase_separation="none")
        tau = 32 * sol.viscosity * PLASMA_VISCOSITY * np.abs(sol.flow) / (np.pi * d ** 3) / DYN_PER_CM2
        p_mmhg = 0.5 * (sol.pressure[g.edges[:, 0]] + sol.pressure[g.edges[:, 1]]) / MMHG - prm.tissue_pressure_mmhg
        tau_e = a0 + a1 / (1 + (np.maximum(p_mmhg, 0.0) / a2) ** a3)
        d_um = d / UM
        fresh = refresh or (prm.metabolic_source == "oxygen" and (step - 1) % max(1, prm.oxygen_update_steps) == 0)
        if fresh:
            source_per_um, oxy = _oxygen_source(gg, sol, prm, None if oxy is None else oxy.tissue_po2,
                                                case.meta.get("sources") or None)
            oxygen_solves += 1
        refresh = False
        down, up_resp = _signals(gg, sol.flow, sol.pressure, d_um, length_um, prm, source_per_um)
        s_tot = (np.log10(tau + prm.tau_ref_dyn_cm2) - np.log10(tau_e)
                 + prm.k_m * (down + up_resp) / d_um - prm.k_s)
        s_tot[~adapting] = 0.0
        d = np.maximum(d * (1 + s_tot * prm.time_step_days / prm.time_scale_days), prm.min_diameter_um * UM)
        residual = float(np.median(np.abs(s_tot[adapting]))) if adapting.any() else 0.0
        history.append(residual)
        if residual < prm.tolerance:
            if prm.metabolic_source == "oxygen" and not fresh:
                refresh = True  # converged on an old oxygen field: update it and check again
                continue
            converged = True
            break
    new_graph = replace(g, diameter=d, meta={**g.meta, "structural_adaptation": True})
    report = {"steps": step, "converged": converged, "median_abs_stimulus": history,
              "metabolic_source": prm.metabolic_source}
    if oxy is not None:
        report.update(oxygen_solves=oxygen_solves,
                      last_hypoxic_fraction=float(oxy.summary.get("hypoxic_fraction", np.nan)),
                      mean_metabolic_source_per_um=float(np.mean(source_per_um)))
    return NetworkCase(new_graph, case.pressure_bc, case.inlet_hematocrit, {**case.meta, "adaptation": report}), report
