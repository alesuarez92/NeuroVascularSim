"""Steady-state oxygen transport: blood in the vessel graph, tissue on a grid.

Blood carries oxygen bound to hemoglobin and dissolved in plasma along each
vessel in the direction of flow. Through the vessel wall it exchanges with
the surrounding tissue, where oxygen diffuses and is consumed.

- **Blood:** the oxygen content per volume of blood is
  ``C(P, H) = H * C_hb * S(P) + alpha * P``, with the Hill saturation
  ``S(P) = P^n / (P^n + P50^n)``. Along a vessel with flow ``Q``,
  ``d(Q C)/dx = -k_w (P - P_tissue)``, where the wall exchange per length
  ``k_w = pi * alpha * D * Nu`` sets the intravascular resistance through a
  Nusselt number. Each step is integrated exactly for a linearised
  ``C(P)``, so the march is stable at any flow and conserves oxygen. At a
  junction the oxygen fluxes mix and PO2 is continuous.
- **Tissue:** ``D alpha lap(P) - M(P) + K_v (P_v - P) = 0`` on a voxel grid,
  with Michaelis-Menten consumption ``M = M0 P / (P + Km)``. Faces are closed
  (no flux), like the flow model. ``K_v`` and ``P_v`` are the wall exchange
  and vessel PO2 of the vessel pieces in each voxel.
- The two are iterated (under-relaxed) until tissue PO2 stops changing.

Default parameters for mouse cortex: the hemoglobin dissociation of C57BL/6
mice (n = 2.59, P50 = 40.2 mmHg), CMRO2 ~2.3 umol/g/min and pial arteriole
PO2 ~100 mmHg, as used by Sakadzic et al. 2014 (Nat Commun 5:5734,
doi:10.1038/ncomms6734) to match their measurements. The other values are
cited where they are defined (OxygenParams); the Nusselt number and tissue
density are assumptions and say so. See docs/oxygen.md.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.sparse import diags, identity, kron
from scipy.sparse.linalg import LinearOperator, cg

from .flow import FlowSolution
from .graph import VascularGraph, VesselType

ARTERIAL = (VesselType.PIAL_ARTERY, VesselType.PENETRATING_ARTERIOLE, VesselType.PRECAPILLARY_ARTERIOLE,
            VesselType.ARTERIOLE)


@dataclass
class OxygenParams:
    """Oxygen-transport parameters: blood, tissue, numerics (defaults: mouse cortex; see the module docstring)."""
    inlet_po2_mmhg: float = 100.0  # pial arterioles (Sakadzic et al. 2014)
    p50_mmhg: float = 40.2  # C57BL/6 mice (Sakadzic et al. 2014)
    hill_n: float = 2.59  # C57BL/6 mice (Sakadzic et al. 2014)
    # Measured with 17O-MRS in mouse cortex, 2.44 +/- 0.29 (Zhu et al. 2013,
    # NeuroImage 64:437, doi:10.1016/j.neuroimage.2012.09.028).
    cmro2_umol_per_g_min: float = 2.44
    # Michaelis-Menten constant, "usually assumed to be about 1 mmHg" (Gagnon et al. 2016,
    # doi:10.3389/fncom.2016.00082); measured closer to 5-10 mmHg in muscle (Golub & Pittman 2012,
    # doi:10.1152/ajpheart.00131.2012). Worth a sensitivity run.
    km_mmhg: float = 1.0
    tissue_density_g_per_ml: float = 1.05  # assumption: no source found; only converts CMRO2 units
    # O2 solubility and diffusivity, as used by Fang et al. 2008 (Opt Express 16:17530,
    # doi:10.1364/oe.16.17530) for mouse cortex: 1.27e-15 umol/(um^3 mmHg) and 2.4e3 um^2/s.
    # One solubility serves plasma and tissue here; Lucker et al. 2018 (doi:10.3389/fphys.2018.00420)
    # give 1.11 (plasma) and 1.53 (tissue) uM/mmHg.
    alpha_uM_per_mmhg: float = 1.27
    diffusivity_m2_per_s: float = 2.4e-9
    # Heme (O2-binding site) density of red cells, 2.03e-5 mol/cm^3 (Lucker et al. 2018, Table 1).
    hb_capacity_mM: float = 20.3
    # Intravascular mass transfer: an assumption, not a value from a paper. It depends on hematocrit
    # (Lucker et al. 2017, doi:10.1111/micc.12337); method as in Hellums et al. 1996 (doi:10.1007/BF02770991).
    nusselt: float = 2.5
    voxel_um: float = 10.0
    sample_um: float = 5.0  # length of vessel steps
    tol_mmhg: float = 0.05
    max_iter: int = 80
    relaxation: float = 1.0  # mixing factor of the (Anderson-accelerated) tissue iteration


@dataclass
class OxygenSolution:
    """Steady oxygen: vessel PO2 and saturation, node PO2, the tissue PO2 grid and a summary."""
    po2: np.ndarray  # (n_edges,) mean vessel PO2, mmHg
    so2: np.ndarray  # (n_edges,) mean hemoglobin saturation
    node_po2: np.ndarray  # (n_nodes,) mmHg
    tissue_po2: np.ndarray  # (nx, ny, nz) mmHg
    grid_origin: np.ndarray  # (3,) m, corner of voxel (0, 0, 0)
    voxel: float  # m
    cmro2: np.ndarray  # (nx, ny, nz) maximal consumption M0, mol/m^3/s
    summary: dict = field(default_factory=dict)
    iterations: int = 0
    converged: bool = False


# -- blood -----------------------------------------------------------------------------------

def saturation(p, p50, n):
    """Hill hemoglobin saturation at PO2 ``p`` (mmHg)."""
    p = np.maximum(np.asarray(p, dtype=float), 0.0)
    pn = p**n
    return pn / (pn + p50**n)


def _dsat(p, p50, n):
    p = np.maximum(np.asarray(p, dtype=float), 1e-9)
    return n * p ** (n - 1) * p50**n / (p**n + p50**n) ** 2


class _Blood:
    """Content C(P, H) in mol/m^3 of blood and its inverse."""

    def __init__(self, prm: OxygenParams):
        self.p50, self.n = prm.p50_mmhg, prm.hill_n
        self.alpha = prm.alpha_uM_per_mmhg * 1e-3  # mol/m^3/mmHg
        self.chb = prm.hb_capacity_mM  # mol/m^3 of red cells

    def content(self, p, h):
        """Oxygen content (mol/m^3 of blood) at PO2 ``p`` and discharge hematocrit ``h``."""
        return h * self.chb * saturation(p, self.p50, self.n) + self.alpha * np.maximum(p, 0.0)

    def slope(self, p, h):
        """dC/dP: change of content per mmHg."""
        return h * self.chb * _dsat(p, self.p50, self.n) + self.alpha

    def po2(self, c, h, guess):
        """Invert C(P, H) = c. The Hill curve inverts in closed form, which gives a
        starting point that three Newton steps polish; the rare values that have
        not converged (e.g. almost no red cells) go to the safeguarded solver."""
        hi = c / self.alpha  # C >= alpha P
        a = h * self.chb
        s = np.clip((c - self.alpha * np.clip(guess, 0.0, hi)) / np.maximum(a, 1e-300), 1e-12, 1 - 1e-12)
        p = np.clip(np.where(a * 1e3 > self.alpha, self.p50 * (s / (1 - s)) ** (1 / self.n), guess), 0.0, hi)
        for _ in range(3):
            p = np.clip(p - (self.content(p, h) - c) / self.slope(p, h), 0.0, hi)
        # Converged when the next Newton correction is below 1e-6 mmHg.
        bad = ~(np.abs((self.content(p, h) - c) / self.slope(p, h)) < 1e-6)
        if bad.any():
            p[bad] = self._po2_safeguarded(c[bad], h[bad], p[bad])
        return p

    def _po2_safeguarded(self, c, h, guess):
        """Invert C(P, H) = c (monotone in P): Newton with bisection fallback."""
        lo = np.zeros_like(c)
        hi = np.maximum(c / self.alpha, 1.0) + 1.0  # C >= alpha P
        p = np.clip(guess, lo, hi)
        for _ in range(40):
            f = self.content(p, h) - c
            lo = np.where(f < 0, p, lo)
            hi = np.where(f > 0, p, hi)
            step = f / self.slope(p, h)
            p_new = p - step
            bad = (p_new <= lo) | (p_new >= hi)
            p_new = np.where(bad, 0.5 * (lo + hi), p_new)
            if np.max(np.abs(p_new - p)) < 1e-6:
                return p_new
            p = p_new
        return p

    def po2_from_flux(self, qh, q, phi, guess):
        """PO2 where inflows mix: qh * Chb * S(P) + q * alpha * P = phi."""
        lo = np.zeros_like(phi)
        hi = phi / (q * self.alpha) + 1.0
        p = np.clip(guess, lo, hi)
        for _ in range(60):
            f = qh * self.chb * saturation(p, self.p50, self.n) + q * self.alpha * p - phi
            lo = np.where(f < 0, p, lo)
            hi = np.where(f > 0, p, hi)
            p_new = p - f / (qh * self.chb * _dsat(p, self.p50, self.n) + q * self.alpha)
            bad = (p_new <= lo) | (p_new >= hi)
            p_new = np.where(bad, 0.5 * (lo + hi), p_new)
            if np.max(np.abs(p_new - p), initial=0.0) < 1e-6:
                return p_new
            p = p_new
        return p


# -- geometry ----------------------------------------------------------------------------------

@dataclass
class _Network:
    """Flowing edges oriented along the flow, cut into steps, in marching order."""

    up: np.ndarray  # (m,) upstream node per flowing edge
    down: np.ndarray
    edge: np.ndarray  # (m,) original edge index
    q: np.ndarray  # (m,) |flow|, m^3/s
    h: np.ndarray  # (m,) discharge hematocrit
    n_steps: np.ndarray  # (m,)
    dx: np.ndarray  # (m,) step length (path length / n_steps), m
    step_voxel: np.ndarray  # (m, max_steps) flat voxel index of each step (-1: none)
    node_level: np.ndarray  # (n_nodes,)
    levels: list  # per level: indices into the flowing-edge arrays whose upstream node is at that level
    inlets: np.ndarray  # nodes where blood enters the network
    start_voxel: np.ndarray | None = None  # (n_nodes,) voxel of each node


def _flow_network(graph: VascularGraph, flow: FlowSolution, grid, prm: OxygenParams) -> _Network:
    q = flow.flow
    qmax = np.abs(q).max()
    flowing = np.flatnonzero(np.abs(q) > 1e-9 * qmax)
    a, b = graph.edges[flowing, 0], graph.edges[flowing, 1]
    forward = q[flowing] > 0
    up, down = np.where(forward, a, b), np.where(forward, b, a)

    n = graph.n_nodes
    indeg = np.bincount(down, minlength=n)
    outdeg = np.bincount(up, minlength=n)
    # Longest-path levels over the flow graph (acyclic: pressure falls along flow).
    level = np.zeros(n, dtype=np.int64)
    remaining = indeg.copy()
    order_up = np.argsort(up, kind="stable")
    starts = np.searchsorted(up[order_up], np.arange(n + 1))
    frontier = np.flatnonzero((remaining == 0) & (outdeg > 0))
    while frontier.size:
        idx = np.concatenate([order_up[starts[u]:starts[u + 1]] for u in frontier]) if frontier.size else []
        idx = np.asarray(idx, dtype=np.int64)
        if idx.size == 0:
            break
        np.maximum.at(level, down[idx], level[up[idx]] + 1)
        np.subtract.at(remaining, down[idx], 1)
        touched = np.unique(down[idx])
        frontier = touched[remaining[touched] == 0]
    if np.any(remaining[indeg > 0] > 0):
        raise RuntimeError("flow graph has a cycle; oxygen transport needs a converged flow solution")

    # Steps along each edge, on the straight line between its nodes (as drawn).
    length = graph.length[flowing]
    n_steps = np.maximum(1, np.ceil(length / (prm.sample_um * 1e-6))).astype(np.int64)
    max_steps = int(n_steps.max())
    t = (np.arange(max_steps)[None, :] + 0.5) / n_steps[:, None]
    pa, pb = graph.positions[up], graph.positions[down]
    pts = pa[:, None, :] + (pb - pa)[:, None, :] * t[:, :, None]
    vox = grid.voxel_of(pts.reshape(-1, 3)).reshape(len(flowing), max_steps)
    vox[np.arange(max_steps)[None, :] >= n_steps[:, None]] = -1

    edge_level = level[up]
    order = np.argsort(edge_level, kind="stable")
    bounds = np.searchsorted(edge_level[order], np.arange(edge_level.max() + 2))
    levels = [order[bounds[i]:bounds[i + 1]] for i in range(len(bounds) - 1)]

    inlets = np.flatnonzero((indeg == 0) & (outdeg > 0))
    return _Network(up, down, flowing, np.abs(q[flowing]), flow.hematocrit[flowing], n_steps,
                    length / n_steps, vox, level, levels, inlets, grid.voxel_of(graph.positions))


class _Grid:
    def __init__(self, graph: VascularGraph, voxel: float):
        lo = graph.positions.min(axis=0)
        hi = graph.positions.max(axis=0)
        self.shape = tuple(int(max(1, np.ceil((hi[i] - lo[i]) / voxel))) for i in range(3))
        self.origin = lo
        self.voxel = voxel

    @property
    def size(self):
        """Number of voxels."""
        return int(np.prod(self.shape))

    def voxel_of(self, pts):
        """Flat voxel index of each point (clipped to the grid)."""
        ijk = np.floor((pts - self.origin) / self.voxel).astype(np.int64)
        for i in range(3):
            np.clip(ijk[:, i], 0, self.shape[i] - 1, out=ijk[:, i])
        return np.ravel_multi_index(ijk.T, self.shape)

    def centers(self):
        """Voxel centres (m), in flat-index order."""
        axes = [self.origin[i] + (np.arange(self.shape[i]) + 0.5) * self.voxel for i in range(3)]
        return np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1).reshape(-1, 3)

    def neg_laplacian(self):
        """-Laplacian with closed (no-flux) faces, 1/m^2."""
        return neg_laplacian(self.shape, self.voxel)


def neg_laplacian(shape, voxel):
    """-Laplacian on a grid of ``shape`` voxels of size ``voxel`` (m), closed (no-flux) faces, 1/m^2."""
    def one_d(n):
        """1D no-flux Laplacian stencil (unscaled) on ``n`` points."""
        if n == 1:
            return diags([0.0], [0], shape=(1, 1))
        main = np.full(n, 2.0)
        main[0] = main[-1] = 1.0
        return diags([main, -np.ones(n - 1), -np.ones(n - 1)], [0, 1, -1])
    nx, ny, nz = shape
    ix, iy, iz = identity(nx), identity(ny), identity(nz)
    lap = (kron(kron(one_d(nx), iy), iz) + kron(kron(ix, one_d(ny)), iz) + kron(kron(ix, iy), one_d(nz)))
    return (lap / voxel**2).tocsr()


# -- metabolism --------------------------------------------------------------------------------

def _depth_of_points(graph: VascularGraph, pts: np.ndarray) -> np.ndarray | None:
    """Depth at arbitrary points, by a linear fit of node depth to position."""
    if graph.depth is None:
        return None
    x = np.column_stack([graph.positions, np.ones(graph.n_nodes)])
    coef, *_ = np.linalg.lstsq(x, np.asarray(graph.depth), rcond=None)
    return np.column_stack([pts, np.ones(len(pts))]) @ coef


def cmro2_field(graph: VascularGraph, grid: _Grid, prm: OxygenParams, scales: list | None) -> np.ndarray:
    """Maximal consumption M0 per voxel (mol/m^3/s), with any scale_cmro2 perturbations applied."""
    m0 = prm.cmro2_umol_per_g_min * prm.tissue_density_g_per_ml / 60.0  # umol/g/min -> mol/m^3/s
    field_ = np.full(grid.size, m0)
    if scales:
        depth_um = _depth_of_points(graph, grid.centers())
        for s in scales:
            mask = np.ones(grid.size, dtype=bool)
            if s.get("depth_range_um") is not None or s.get("layers"):
                if depth_um is None:
                    raise ValueError("depth or layer selection of CMRO2 needs a network with cortical depth")
                d = depth_um / 1e-6
                if s.get("depth_range_um") is not None:
                    lo, hi = s["depth_range_um"]
                    mask &= (d >= lo) & (d <= hi)
                if s.get("layers"):
                    bounds = graph.meta.get("layer_bounds_um")
                    if bounds is None:
                        raise ValueError("layer selection of CMRO2 needs layer boundaries")
                    layer = np.searchsorted(bounds, d, side="right")
                    mask &= np.isin(layer, list(s["layers"]))
            field_[mask] *= float(s["factor"])
    return field_


# -- solver ------------------------------------------------------------------------------------

def solve_oxygen(graph: VascularGraph, flow: FlowSolution, params: OxygenParams | None = None,
                 cmro2_scales: list | None = None, inlet_nodes=None,
                 initial_tissue_po2: np.ndarray | None = None) -> OxygenSolution:
    """Steady oxygen in vessels and tissue for a converged flow solution.

    ``inlet_nodes``: where arterial blood enters (default: every node with
    outflow and no inflow). Other nodes without inflow take the tissue PO2.
    ``cmro2_scales``: consumption changes, e.g. from scale_cmro2 perturbations.
    ``initial_tissue_po2``: starting tissue PO2 grid (e.g. a previous solution's
    ``tissue_po2`` on the same grid), to converge faster after small changes.
    """
    prm = params or OxygenParams()
    blood = _Blood(prm)
    grid = _Grid(graph, prm.voxel_um * 1e-6)
    net = _flow_network(graph, flow, grid, prm)
    if inlet_nodes is not None:
        net.inlets = np.intersect1d(net.inlets, np.asarray(list(inlet_nodes), dtype=np.int64))
    alpha = blood.alpha
    d_alpha = prm.diffusivity_m2_per_s * alpha  # mol/(m s mmHg)
    k_wall = np.pi * d_alpha * prm.nusselt  # per length of vessel, mol/(m s mmHg)
    v_vox = grid.voxel**3
    m0 = cmro2_field(graph, grid, prm, cmro2_scales)
    neg_lap = grid.neg_laplacian() * d_alpha
    lap_diag = neg_lap.diagonal()

    tissue = np.full(grid.size, 0.5 * prm.inlet_po2_mmhg)
    if initial_tissue_po2 is not None and np.size(initial_tissue_po2) == grid.size:
        tissue = np.clip(np.asarray(initial_tissue_po2, dtype=float).ravel(), 0.0, prm.inlet_po2_mmhg)
    m, max_steps = net.step_voxel.shape
    valid = net.step_voxel >= 0

    node_p = np.full(graph.n_nodes, np.nan)
    step_p = np.zeros((m, max_steps))
    converged = False
    it = 0
    history = []
    anderson = _Anderson(depth=5)
    for it in range(1, prm.max_iter + 1):
        node_p, step_p, edge_c_in, edge_c_out, g_step, p_start = _march(net, blood, tissue, k_wall, prm,
                                                                         graph.n_nodes)
        # Each vessel step delivers G (P_start - P_tissue): G is the wall conductance for fast flow
        # and the flow-limited conductance Q dC/dP for slow flow (from the exact step solution).
        kv = np.bincount(net.step_voxel[valid], weights=g_step[valid], minlength=grid.size) / v_vox
        kvpv = np.bincount(net.step_voxel[valid], weights=(g_step * p_start)[valid], minlength=grid.size) / v_vox
        # Michaelis-Menten consumption, linearised about the current tissue PO2 (Newton).
        p0 = np.maximum(tissue, 0.0)
        m_now = m0 * p0 / (p0 + prm.km_mmhg)
        m_slope = m0 * prm.km_mmhg / (p0 + prm.km_mmhg) ** 2
        # A = -D alpha lap + diag(d): applied without assembling it, Jacobi-preconditioned.
        d = m_slope + kv
        a = LinearOperator(neg_lap.shape, matvec=lambda x, d=d: neg_lap @ x + d * x, dtype=float)
        jacobi = LinearOperator(neg_lap.shape, matvec=lambda x, inv=1.0 / (lap_diag + d): inv * x, dtype=float)
        new, _ = cg(a, kvpv - m_now + m_slope * p0, x0=tissue, rtol=1e-8, maxiter=2000, M=jacobi)
        new = np.clip(new, 0.0, prm.inlet_po2_mmhg)
        change = float(np.max(np.abs(new - tissue)))
        history.append(change)
        if change < prm.tol_mmhg:
            tissue = new
            converged = True
            break
        # Tissue PO2 lies between 0 and the arterial PO2 (maximum principle).
        tissue = np.clip(anderson.step(tissue, new, prm.relaxation), 0.0, prm.inlet_po2_mmhg)
    node_p, step_p, edge_c_in, edge_c_out, _, _ = _march(net, blood, tissue, k_wall, prm, graph.n_nodes)

    # Per-edge results; non-flowing edges take the tissue PO2 around them.
    po2 = np.full(graph.n_edges, np.nan)
    po2[net.edge] = np.where(valid, step_p, 0).sum(axis=1) / net.n_steps
    still = np.isnan(po2)
    if still.any():
        mid = 0.5 * (graph.positions[graph.edges[still, 0]] + graph.positions[graph.edges[still, 1]])
        po2[still] = tissue[grid.voxel_of(mid)]
    nodes_nan = np.isnan(node_p)
    node_p[nodes_nan] = tissue[grid.voxel_of(graph.positions[nodes_nan])]
    so2 = saturation(po2, prm.p50_mmhg, prm.hill_n)

    summary = _summary(graph, net, blood, tissue, m0, prm, edge_c_in, edge_c_out, grid)
    summary.update(iterations=it, converged=converged, change_history=history)
    return OxygenSolution(po2=po2, so2=so2, node_po2=node_p, tissue_po2=tissue.reshape(grid.shape),
                          grid_origin=grid.origin, voxel=grid.voxel, cmro2=m0.reshape(grid.shape),
                          summary=summary, iterations=it, converged=converged)


class _Anderson:
    """Anderson acceleration of the fixed-point iteration x -> T(x) (Walker & Ni 2011)."""

    def __init__(self, depth: int = 5):
        self.depth = depth
        self.xs: list[np.ndarray] = []
        self.fs: list[np.ndarray] = []

    def step(self, x: np.ndarray, tx: np.ndarray, beta: float) -> np.ndarray:
        """Next iterate from the current one ``x`` and its image ``tx``, mixed by ``beta``."""
        f = tx - x
        self.xs.append(x.copy())
        self.fs.append(f)
        if len(self.xs) > self.depth + 1:
            self.xs.pop(0)
            self.fs.pop(0)
        if len(self.fs) < 2:
            return x + beta * f
        df = np.stack([self.fs[i + 1] - self.fs[i] for i in range(len(self.fs) - 1)], axis=1)
        dx = np.stack([self.xs[i + 1] - self.xs[i] for i in range(len(self.xs) - 1)], axis=1)
        gamma, *_ = np.linalg.lstsq(df, f, rcond=None)
        return x + beta * f - (dx + beta * df) @ gamma


def _march(net: _Network, blood: _Blood, tissue: np.ndarray, k_wall: float, prm: OxygenParams, n_nodes: int):
    """Carry oxygen along the flow, level by level; returns node PO2, step PO2 and edge end contents."""
    m, max_steps = net.step_voxel.shape
    node_p = np.full(n_nodes, np.nan)
    phi = np.zeros(n_nodes)  # oxygen flux arriving at each node, mol/s
    qin = np.zeros(n_nodes)
    qhin = np.zeros(n_nodes)
    step_p = np.zeros((m, max_steps))
    g_step = np.zeros((m, max_steps))
    p_start = np.zeros((m, max_steps))
    c_in = np.zeros(m)
    c_out = np.zeros(m)
    # Nodes without inflow: arterial blood at inlets, else blood as oxygenated as the tissue around.
    starts = np.setdiff1d(np.unique(net.up), net.down)
    node_p[starts] = tissue[net.start_voxel[starts]] if net.start_voxel is not None else prm.inlet_po2_mmhg
    node_p[net.inlets] = prm.inlet_po2_mmhg
    for group in net.levels:
        if group.size == 0:
            continue
        ups = np.unique(net.up[group])
        todo = ups[np.isnan(node_p[ups])]
        if todo.size:
            node_p[todo] = blood.po2_from_flux(qhin[todo], qin[todo], phi[todo], np.full(todo.size, 50.0))
        q, h = net.q[group], net.h[group]
        p = node_p[net.up[group]].copy()
        c = blood.content(p, h)
        c_in[group] = c
        n_steps = net.n_steps[group]
        rate_base = k_wall * net.dx[group] / q
        for k in range(int(n_steps.max())):
            active = k < n_steps
            vox = net.step_voxel[group, k]
            pt = tissue[np.where(vox >= 0, vox, 0)]
            # Relax toward the content in equilibrium with the tissue; the secant slope of C(P)
            # between vessel and tissue PO2 keeps the step exact at both ends (no overshoot).
            c_eq = blood.content(pt, h)
            dp = pt - p
            small = np.abs(dp) < 1e-6
            slope = np.where(small, blood.slope(p, h), (c_eq - c) / np.where(small, 1.0, dp))
            decay = np.exp(-rate_base / slope)
            c_new = c_eq + (c - c_eq) * decay
            g_step[group, k] = np.where(active, q * (1.0 - decay) * slope, 0.0)
            p_start[group, k] = np.where(active, p, 0.0)
            c_new = np.maximum(c_new, 0.0)
            p_new = blood.po2(c_new, h, p)
            step_p[group, k] = np.where(active, 0.5 * (p + p_new), 0.0)
            c = np.where(active, c_new, c)
            p = np.where(active, p_new, p)
        c_out[group] = c
        dn = net.down[group]
        np.add.at(phi, dn, q * c)
        np.add.at(qin, dn, q)
        np.add.at(qhin, dn, q * h)
    # Nodes that only receive flow (outlets) get the mixed PO2 of their inflows.
    last = np.flatnonzero(np.isnan(node_p) & (qin > 0))
    if last.size:
        node_p[last] = blood.po2_from_flux(qhin[last], qin[last], phi[last], np.full(last.size, 30.0))
    return node_p, step_p, c_in, c_out, g_step, p_start


def _summary(graph, net, blood, tissue, m0, prm, c_in, c_out, grid) -> dict:
    """Oxygen extraction, consumption, and tissue PO2 by depth."""
    q = net.q
    delivered = q * (c_in - c_out)  # mol/s lost by each flowing edge
    inflow_o2 = sum(float(np.sum(q[net.up == n] * c_in[net.up == n])) for n in net.inlets)
    outlets = np.setdiff1d(net.down, net.up)
    outflow_o2 = sum(float(np.sum(q[net.down == n] * c_out[net.down == n])) for n in outlets)
    consumption = m0 * np.maximum(tissue, 0) / (np.maximum(tissue, 0) + prm.km_mmhg)
    arterial = np.isin(graph.vessel_type[net.edge], ARTERIAL)
    out = {
        "oef": 1.0 - outflow_o2 / inflow_o2 if inflow_o2 > 0 else None,
        "arteriolar_extraction_fraction": float(delivered[arterial].sum() / delivered.sum()) if delivered.sum() > 0 else None,
        # mol/m^3/s -> umol/g/min
        "cmro2_umol_per_g_min": float(consumption.mean() * 60.0 / prm.tissue_density_g_per_ml),
        "o2_balance": float(delivered.sum() / (consumption.sum() * grid.voxel**3)) if consumption.sum() > 0 else None,
        "tissue_po2_mean": float(tissue.mean()),
        "tissue_po2_p10": float(np.percentile(tissue, 10)),
        "hypoxic_fraction": float(np.mean(tissue < 10.0)),
    }
    depth_um = _depth_of_points(graph, grid.centers())
    if depth_um is not None:
        d = depth_um / 1e-6
        edges_ = np.arange(0.0, d.max() + 50.0, 50.0)
        idx = np.digitize(d, edges_) - 1
        prof_mean, prof_p10, centers = [], [], []
        for i in range(len(edges_) - 1):
            sel = idx == i
            if sel.sum() == 0:
                continue
            centers.append(float(0.5 * (edges_[i] + edges_[i + 1])))
            prof_mean.append(float(tissue[sel].mean()))
            prof_p10.append(float(np.percentile(tissue[sel], 10)))
        out["depth_profile"] = {"depth_um": centers, "tissue_po2_mean": prof_mean, "tissue_po2_p10": prof_p10}
    return out
