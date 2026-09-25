"""Steady blood flow on a vascular graph, with red-cell redistribution.

Each segment obeys Poiseuille's law with an apparent viscosity that depends
on its diameter and hematocrit. Flow is conserved at every node (Kirchhoff),
and fixed pressures are imposed at boundary nodes. Red cells split at
bifurcations by a phase-separation law and mix at convergences. Flow and
hematocrit are iterated to a self-consistent solution.

This generalises the detailed model of Suarez et al. 2021 (J Theor Biol
529:110856, Appendix A) from one idealised tree to any graph.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

from .. import registry
from ..units import PLASMA_VISCOSITY
from .graph import VascularGraph

#: Upper bound on discharge hematocrit after phase separation (tiny daughter
#: flows can otherwise produce unphysical values).
MAX_HEMATOCRIT = 0.99


@dataclass
class FlowSolution:
    """Result of :func:`solve_flow`. Arrays are indexed by node or edge.

    ``flow`` is signed: positive means from ``edges[k, 0]`` to ``edges[k, 1]``.
    """

    pressure: np.ndarray  # (n_nodes,) Pa
    flow: np.ndarray  # (n_edges,) m^3/s
    hematocrit: np.ndarray  # (n_edges,) discharge hematocrit
    viscosity: np.ndarray  # (n_edges,) apparent viscosity relative to plasma
    resistance: np.ndarray  # (n_edges,) Pa*s/m^3
    iterations: int
    converged: bool


def poiseuille_resistance(diameter, length, relative_viscosity, plasma_viscosity=PLASMA_VISCOSITY):
    """R = 128 * eta * L / (pi * D^4), in Pa*s/m^3."""
    eta = relative_viscosity * plasma_viscosity
    return 128.0 * eta * length / (np.pi * diameter**4)


def solve_pressures(graph: VascularGraph, resistance: np.ndarray, pressure_bc: dict[int, float]):
    """Node pressures and edge flows for fixed resistances (a linear solve)."""
    if not pressure_bc:
        raise ValueError("at least one node needs a fixed pressure")
    n = graph.n_nodes
    a, b = graph.edges[:, 0], graph.edges[:, 1]
    g = 1.0 / resistance
    rows = np.concatenate([a, b, a, b])
    cols = np.concatenate([a, b, b, a])
    vals = np.concatenate([g, g, -g, -g])
    lap = coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()

    fixed = np.fromiter(pressure_bc.keys(), dtype=np.int64)
    p = np.zeros(n)
    p[fixed] = np.fromiter(pressure_bc.values(), dtype=float)
    free = np.setdiff1d(np.arange(n), fixed)
    if free.size:
        rhs = -lap[free][:, fixed] @ p[fixed]
        p[free] = spsolve(lap[free][:, free].tocsc(), rhs)
        if not np.all(np.isfinite(p)):
            raise ValueError("pressure system is singular: a component has no fixed-pressure node")
    q = g * (p[a] - p[b])
    return p, q


def _update_hematocrit(graph, q, h_prev, inlet_h, phase_law, max_sweeps=None):
    """Propagate discharge hematocrit downstream through a fixed flow field.

    Red cells mix at convergences (flux-weighted) and split at bifurcations by
    ``phase_law``; with more than two daughters they split in proportion to
    flow. The update is vectorised: repeated sweeps over all nodes reach the
    same fixed point as a node-by-node walk in flow order, because the flow
    field has no cycles, and each sweep costs a few array operations.
    """
    n = graph.n_nodes
    h = h_prev.copy()
    absq = np.abs(q)
    fe = np.flatnonzero(absq > 0)
    if fe.size == 0:
        return h
    a, b = graph.edges[:, 0], graph.edges[:, 1]
    up = np.where(q >= 0, a, b)[fe]
    down = np.where(q >= 0, b, a)[fe]
    qf = absq[fe]
    d = graph.diameter

    q_in = np.bincount(down, weights=qf, minlength=n)
    q_out = np.bincount(up, weights=qf, minlength=n)

    # Hematocrit of blood entering at source nodes (outflow, no inflow).
    h_src = np.full(n, inlet_h[-1])
    for node, value in inlet_h.items():
        if node >= 0:
            h_src[node] = value

    # Parent diameter at each node: the inflow edge carrying most flow, or
    # the widest outflow edge at a source.
    d_parent = np.zeros(n)
    np.maximum.at(d_parent, up, d[fe])
    by_node = np.lexsort((qf, down))
    last = by_node[np.r_[np.diff(down[by_node]) != 0, True]]
    d_parent[down[last]] = d[fe[last]]

    # Bifurcations: nodes with exactly two outflow edges.
    order = np.argsort(up, kind="stable")
    n_out = np.bincount(up, minlength=n)
    first = np.r_[0, np.cumsum(n_out)[:-1]]
    two = np.flatnonzero(n_out == 2)
    ka = fe[order[first[two]]]
    kb = fe[order[first[two] + 1]]
    fqb = absq[ka] / (absq[ka] + absq[kb])

    for _ in range(max_sweeps or n + 1):
        rbc_in = np.bincount(down, weights=h[fe] * qf, minlength=n)
        with np.errstate(invalid="ignore", divide="ignore"):
            h_node = np.where(q_in > 0, rbc_in / q_in, h_src)
        new = h.copy()
        new[fe] = h_node[up]
        if two.size:
            fqe = np.asarray(phase_law(fqb, d[ka], d[kb], d_parent[two], h_node[two]), dtype=float)
            rbc = h_node[two] * q_out[two]
            new[ka] = np.minimum(fqe * rbc / absq[ka], MAX_HEMATOCRIT)
            new[kb] = np.minimum((1.0 - fqe) * rbc / absq[kb], MAX_HEMATOCRIT)
        done = np.max(np.abs(new - h)) < 1e-12
        h = new
        if done:
            break
    return h


def solve_flow(
    graph: VascularGraph,
    pressure_bc: dict[int, float],
    *,
    inlet_hematocrit: float | dict[int, float] = 0.45,
    viscosity: str = "pries_invivo",
    phase_separation: str = "pries",
    plasma_viscosity: float = PLASMA_VISCOSITY,
    tol: float = 1e-3,
    max_iter: int = 500,
    relaxation: float = 0.5,
) -> FlowSolution:
    """Self-consistent steady flow and hematocrit on ``graph``.

    Flow and hematocrit are iterated: flow for the current viscosities, then
    hematocrit for that flow, under-relaxed. Networks with loops can oscillate
    (red-cell partitioning feeds back on flow), so the relaxation factor is
    reduced whenever the flow change grows. In large looped networks a few
    low-flow capillaries can keep switching direction (red-cell partitioning
    admits several equilibria), so the default tolerance is a 0.1% flow
    change; check ``converged`` and ``iterations`` on the result.

    Args:
        pressure_bc: fixed pressures {node index: Pa}.
        inlet_hematocrit: discharge hematocrit of blood entering the network,
            one value or per source node.
        viscosity, phase_separation: plugin names (see :mod:`registry`).
        tol: convergence threshold on the largest relative change in flow
            between iterations, over edges carrying at least 1e-3 of the
            largest flow.
        relaxation: initial under-relaxation factor for hematocrit (0–1].
    """
    visc_law = registry.create("viscosity", viscosity)
    phase_law = registry.create("phase_separation", phase_separation)
    if isinstance(inlet_hematocrit, dict):
        inlet_h = dict(inlet_hematocrit)
        inlet_h.setdefault(-1, float(np.mean(list(inlet_hematocrit.values()))))
    else:
        inlet_h = {-1: float(inlet_hematocrit)}

    h = np.full(graph.n_edges, inlet_h[-1])
    omega = relaxation
    q_prev = None
    last_change = np.inf
    converged = False
    for it in range(1, max_iter + 1):
        eta = visc_law(graph.diameter, h)
        r = poiseuille_resistance(graph.diameter, graph.length, eta, plasma_viscosity)
        p, q = solve_pressures(graph, r, pressure_bc)
        if q_prev is not None:
            big = np.abs(q) >= 1e-3 * np.abs(q).max()
            change = float(np.max(np.abs(q - q_prev)[big] / np.abs(q)[big])) if big.any() else 0.0
            if change < tol:
                converged = True
                break
            if change > last_change:
                omega = max(0.7 * omega, 0.02)
            last_change = change
        h = h + omega * (_update_hematocrit(graph, q, h, inlet_h, phase_law) - h)
        q_prev = q

    # Report the exact red-cell split for the final flow, so red cells are
    # conserved at every node; it differs from the hematocrit used for the
    # final viscosities by less than the convergence tolerance.
    h = _update_hematocrit(graph, q, h, inlet_h, phase_law)
    return FlowSolution(p, q, h, eta, r, it, converged)
