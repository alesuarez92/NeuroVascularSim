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


def _update_hematocrit(graph, q, h_prev, inlet_h, pressure, phase_law):
    """Propagate discharge hematocrit downstream through the current flow field."""
    n = graph.n_nodes
    h = h_prev.copy()
    a, b = graph.edges[:, 0], graph.edges[:, 1]
    # Upstream and downstream node of every edge under the current flow.
    up = np.where(q >= 0, a, b)
    down = np.where(q >= 0, b, a)
    absq = np.abs(q)
    flowing = absq > 0

    inflow = [[] for _ in range(n)]
    outflow = [[] for _ in range(n)]
    for k in np.flatnonzero(flowing):
        outflow[up[k]].append(k)
        inflow[down[k]].append(k)

    # Flow runs from high to low pressure, so descending pressure is a
    # topological order of the flow network.
    for node in np.argsort(-pressure, kind="stable"):
        outs = outflow[node]
        if not outs:
            continue
        ins = inflow[node]
        if ins:
            q_in = absq[ins].sum()
            h_in = float((h[ins] * absq[ins]).sum() / q_in)
            d_parent = graph.diameter[ins[int(np.argmax(absq[ins]))]]
        else:  # a source node: blood enters the network here
            q_in = absq[outs].sum()
            h_in = float(inlet_h.get(int(node), inlet_h.get(-1)))
            d_parent = graph.diameter[outs].max()

        if len(outs) == 1:
            h[outs[0]] = h_in
        elif len(outs) == 2:
            ka, kb = outs
            fqb = absq[ka] / (absq[ka] + absq[kb])
            fqe = float(phase_law(fqb, graph.diameter[ka], graph.diameter[kb], d_parent, h_in))
            rbc = h_in * q_in
            h[ka] = min(fqe * rbc / absq[ka], MAX_HEMATOCRIT)
            h[kb] = min((1.0 - fqe) * rbc / absq[kb], MAX_HEMATOCRIT)
        else:
            # More than two daughters: no empirical law; split in proportion to flow.
            h[outs] = h_in
    return h


def solve_flow(
    graph: VascularGraph,
    pressure_bc: dict[int, float],
    *,
    inlet_hematocrit: float | dict[int, float] = 0.45,
    viscosity: str = "pries_invivo",
    phase_separation: str = "pries",
    plasma_viscosity: float = PLASMA_VISCOSITY,
    tol: float = 1e-8,
    max_iter: int = 500,
    relaxation: float = 1.0,
) -> FlowSolution:
    """Self-consistent steady flow and hematocrit on ``graph``.

    Args:
        pressure_bc: fixed pressures {node index: Pa}.
        inlet_hematocrit: discharge hematocrit of blood entering the network,
            one value or per source node.
        viscosity, phase_separation: plugin names (see :mod:`registry`).
        tol: convergence threshold on the largest hematocrit change.
        relaxation: under-relaxation factor for the hematocrit update (0–1].
    """
    visc_law = registry.create("viscosity", viscosity)
    phase_law = registry.create("phase_separation", phase_separation)
    if isinstance(inlet_hematocrit, dict):
        inlet_h = dict(inlet_hematocrit)
        inlet_h.setdefault(-1, float(np.mean(list(inlet_hematocrit.values()))))
    else:
        inlet_h = {-1: float(inlet_hematocrit)}

    h = np.full(graph.n_edges, inlet_h[-1])
    converged = False
    for it in range(1, max_iter + 1):
        eta = visc_law(graph.diameter, h)
        r = poiseuille_resistance(graph.diameter, graph.length, eta, plasma_viscosity)
        p, q = solve_pressures(graph, r, pressure_bc)
        h_new = _update_hematocrit(graph, q, h, inlet_h, p, phase_law)
        change = np.max(np.abs(h_new - h)) if h.size else 0.0
        h = h + relaxation * (h_new - h)
        if change < tol:
            converged = True
            break

    eta = visc_law(graph.diameter, h)
    r = poiseuille_resistance(graph.diameter, graph.length, eta, plasma_viscosity)
    p, q = solve_pressures(graph, r, pressure_bc)
    return FlowSolution(p, q, h, eta, r, it, converged)
