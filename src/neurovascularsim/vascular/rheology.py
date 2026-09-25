"""Blood rheology in microvessels: apparent viscosity and phase separation.

Empirical laws of Pries and Secomb, as used in Suarez et al. 2021
(J Theor Biol 529:110856, Table A1). Their fitted coefficients take
diameters in micrometres, so inputs are converted from SI here.
"""

from __future__ import annotations

import numpy as np

from .. import registry
from ..units import UM


def viscosity_pries_invivo(diameter, hematocrit):
    """In-vivo apparent viscosity relative to plasma (Pries et al. 1994 form).

    Args:
        diameter: vessel diameter, m (array).
        hematocrit: discharge hematocrit (array, 0–1).
    """
    d = np.asarray(diameter, dtype=float) / UM
    h = np.asarray(hematocrit, dtype=float)
    if np.any(d <= 1.1):
        raise ValueError("in-vivo viscosity law requires diameters above 1.1 um")
    eta45 = 6.0 * np.exp(-0.085 * d) + 3.2 - 2.44 * np.exp(-0.06 * d**0.645)
    s = 1.0 / (1.0 + 1e-11 * d**12)
    c = (0.8 + np.exp(-0.075 * d)) * (-1.0 + s) + s
    k = (d / (d - 1.1)) ** 2
    shape = ((1.0 - h) ** c - 1.0) / ((1.0 - 0.45) ** c - 1.0)
    return (1.0 + (eta45 - 1.0) * shape * k) * k


@registry.register(
    "viscosity",
    "pries_invivo",
    description="In-vivo apparent viscosity vs diameter and hematocrit.",
    reference="Pries et al. 1994 Circ Res; as used in Suarez et al. 2021 J Theor Biol",
)
def _pries_invivo():
    return viscosity_pries_invivo


def viscosity_pries_invitro(diameter, hematocrit):
    """In-vitro apparent viscosity relative to plasma (Pries et al. 1992).

    Blood in glass tubes: the Fahraeus-Lindqvist effect without the
    endothelial surface layer, so small vessels are far less viscous than
    under the in-vivo law (about 2.3 against 18 at 4 um and hematocrit 0.45).

    Args:
        diameter: vessel diameter, m (array).
        hematocrit: discharge hematocrit (array, 0–1).
    """
    d = np.asarray(diameter, dtype=float) / UM
    h = np.asarray(hematocrit, dtype=float)
    eta45 = 220.0 * np.exp(-1.3 * d) + 3.2 - 2.44 * np.exp(-0.06 * d**0.645)
    s = 1.0 / (1.0 + 1e-11 * d**12)
    c = (0.8 + np.exp(-0.075 * d)) * (-1.0 + s) + s
    shape = ((1.0 - h) ** c - 1.0) / ((1.0 - 0.45) ** c - 1.0)
    return 1.0 + (eta45 - 1.0) * shape


@registry.register(
    "viscosity",
    "pries_invitro",
    description="In-vitro apparent viscosity vs diameter and hematocrit (no endothelial surface layer).",
    reference="Pries et al. 1992 Am J Physiol 263:H1770",
)
def _pries_invitro():
    return viscosity_pries_invitro


@registry.register(
    "viscosity",
    "constant",
    description="Constant relative viscosity (Newtonian blood); for tests and baselines.",
    parameters={"value": 1.0},
)
def _constant(value: float = 1.0):
    def law(diameter, hematocrit):
        return np.full(np.broadcast(np.asarray(diameter), np.asarray(hematocrit)).shape, float(value))

    return law


def _logit(x):
    return np.log(x / (1.0 - x))


def phase_separation_pries(fqb, d_alpha, d_beta, d_parent, h_parent):
    """Fraction of the parent's red-cell flux that enters daughter alpha.

    Args:
        fqb: fraction of the parent's blood flow entering alpha (0–1).
        d_alpha, d_beta, d_parent: diameters, m.
        h_parent: discharge hematocrit of the parent.
    """
    da, db, dp = (np.asarray(x, dtype=float) / UM for x in (d_alpha, d_beta, d_parent))
    fqb = np.asarray(fqb, dtype=float)
    hp = np.asarray(h_parent, dtype=float)
    r2 = da**2 / db**2
    a = -13.29 * ((r2 - 1.0) / (r2 + 1.0)) * (1.0 - hp) / dp
    b = 1.0 + 6.98 * (1.0 - hp) / dp
    x0 = 0.964 * (1.0 - hp) / dp
    fqe = np.empty(np.broadcast(fqb, a).shape)
    fqb_b = np.broadcast_to(fqb, fqe.shape)
    x0_b = np.broadcast_to(x0, fqe.shape)
    low = fqb_b <= x0_b
    high = fqb_b >= 1.0 - x0_b
    mid = ~(low | high)
    fqe[low] = 0.0
    fqe[high] = 1.0
    if np.any(mid):
        a_b, b_b = np.broadcast_to(a, fqe.shape), np.broadcast_to(b, fqe.shape)
        arg = (fqb_b[mid] - x0_b[mid]) / (1.0 - 2.0 * x0_b[mid])
        fqe[mid] = 1.0 / (1.0 + np.exp(-(a_b[mid] + b_b[mid] * _logit(arg))))
    return fqe if fqe.shape else float(fqe)


@registry.register(
    "phase_separation",
    "pries",
    description="Empirical red-cell phase separation at bifurcations.",
    reference="Pries & Secomb 2005/2008; as used in Suarez et al. 2021 J Theor Biol",
)
def _pries_phase():
    return phase_separation_pries


@registry.register(
    "phase_separation",
    "none",
    description="No phase separation: red cells split in proportion to blood flow.",
)
def _no_phase():
    def law(fqb, d_alpha, d_beta, d_parent, h_parent):
        return np.asarray(fqb, dtype=float)

    return law
