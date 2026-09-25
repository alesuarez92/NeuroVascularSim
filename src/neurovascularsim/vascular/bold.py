"""BOLD signal from the vessel graph: laminar profiles of the signal change.

Each depth slab of the column is a small "voxel" holding the vessels that
pass through it. Its gradient-echo signal at echo time TE is the
extravascular tissue signal plus the signal of the blood inside the vessels
(the classical two-compartment form; Buxton et al. 1998, Obata et al. 2004,
as generalised by Stephan et al. 2007):

    S = (1 - V) exp(-TE dR2*_E) + eps * sum_k v_k exp(-TE r0 (1 - Y_k))
    dR2*_E = c * theta0 * sum_k v_k (1 - Y_k)

- ``v_k``: volume fraction of vessel k in the slab; ``V = sum v_k``.
- ``Y_k``: its hemoglobin saturation.
- ``theta0``: the frequency offset at the surface of a vessel of fully
  deoxygenated blood (40.3 1/s at 1.5 T; it scales with field strength).
- ``c``: 4.3, the static-dephasing factor.
- ``r0``: the slope of intravascular R2* against (1 - Y) (25 1/s at 1.5 T).
- ``eps``: the ratio of intravascular to extravascular signal at rest, poorly
  known and best treated as free (Stephan et al. 2007).

The values are those of Obata et al. 2004 (NeuroImage 21:144,
doi:10.1016/j.neuroimage.2003.08.040) as reported in Stephan et al. 2007
(NeuroImage 38:387, doi:10.1016/j.neuroimage.2007.07.040). ``r0`` and ``eps`` for fields above 1.5 T must be set
by the user: they are not scaled automatically.

The signal change of a condition against the baseline includes both the
saturation changes (from the oxygen model) and the volume changes (from the
diameters), vessel by vessel. That is what carries deoxygenated blood from
deep layers up the ascending venules into the superficial signal.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .graph import VascularGraph, VesselType

CLASSES = {
    "arterial": (VesselType.PIAL_ARTERY, VesselType.PENETRATING_ARTERIOLE, VesselType.PRECAPILLARY_ARTERIOLE,
                 VesselType.ARTERIOLE),
    "capillary": (VesselType.CAPILLARY, VesselType.UNCLASSIFIED),
    "venous": (VesselType.VENULE, VesselType.ASCENDING_VENULE, VesselType.PIAL_VEIN),
}


@dataclass
class BoldParams:
    """Acquisition and signal-model parameters of the BOLD model (defaults: 1.5 T, TE 40 ms)."""
    field_t: float = 1.5
    te_ms: float = 40.0
    theta0_per_s_at_1p5t: float = 40.3  # Obata et al. 2004 (via Stephan et al. 2007)
    r0_per_s: float = 25.0  # at 1.5 T (Obata et al. 2004); set it for other fields
    epsilon: float = 1.0  # intra/extravascular signal ratio at rest (Stephan et al. 2007 prior mean)
    extravascular_factor: float = 4.3  # static dephasing (Obata et al. 2004)
    slab_um: float = 50.0


def _slab_volumes(graph: VascularGraph, slab_um: float, n_samples: int = 8):
    """Vessel volume of each edge in each depth slab (edges split along their depth span)."""
    if graph.depth is None:
        raise ValueError("BOLD profiles need a network with cortical depth")
    depth_um = np.asarray(graph.depth) / 1e-6
    d0, d1 = depth_um[graph.edges[:, 0]], depth_um[graph.edges[:, 1]]
    t = (np.arange(n_samples) + 0.5) / n_samples
    d = d0[:, None] + (d1 - d0)[:, None] * t[None, :]
    n_slabs = int(np.ceil(max(depth_um.max(), slab_um) / slab_um))
    slab = np.clip((d // slab_um).astype(np.int64), 0, n_slabs - 1)
    return slab, n_slabs


def _column_area_m2(graph: VascularGraph) -> float:
    depth_extent = (np.max(graph.depth) - np.min(graph.depth))
    volume = graph.meta.get("volume_mm3")
    if volume is not None and depth_extent > 0:
        return volume * 1e-9 / depth_extent
    span = graph.positions.max(axis=0) - graph.positions.min(axis=0)
    axis = int(np.argmax([abs(np.corrcoef(graph.positions[:, i], graph.depth)[0, 1]) if np.ptp(graph.positions[:, i])
                          else 0 for i in range(3)]))
    return float(np.prod(np.delete(span, axis)))


def _slab_terms(graph, diameter, so2, prm, slab, n_slabs, area):
    """Per slab: vessel volume fraction and sum of v (1 - Y), in total and per vessel."""
    vol = np.pi * (diameter / 2) ** 2 * graph.length  # m^3
    n_samples = slab.shape[1]
    slab_volume = area * prm.slab_um * 1e-6
    w = np.repeat(vol / n_samples, n_samples)
    edge_of = np.repeat(np.arange(graph.n_edges), n_samples)
    sl = slab.ravel()
    v = np.bincount(sl, weights=w, minlength=n_slabs) / slab_volume
    deoxy = np.bincount(sl, weights=w * (1 - so2[edge_of]), minlength=n_slabs) / slab_volume
    return v, deoxy, w, edge_of, sl, slab_volume


def _signal(prm: BoldParams, v, deoxy, iv_sum):
    te = prm.te_ms * 1e-3
    theta0 = prm.theta0_per_s_at_1p5t * prm.field_t / 1.5
    extra = (1 - v) * np.exp(-te * prm.extravascular_factor * theta0 * deoxy)
    intra = prm.epsilon * iv_sum
    return extra, intra


def _intravascular(prm, w, edge_of, sl, so2, n_slabs, slab_volume):
    te = prm.te_ms * 1e-3
    return np.bincount(sl, weights=w * np.exp(-te * prm.r0_per_s * (1 - so2[edge_of])), minlength=n_slabs) / slab_volume


def bold_profile(graph: VascularGraph, base_diameter, base_so2, cond_diameter, cond_so2,
                 params: BoldParams | None = None) -> dict:
    """Laminar BOLD signal change (%) of a condition against the baseline.

    Returns slab depths, the total change per slab and for the column, the
    extravascular and intravascular parts, and the change when only one
    vessel class (arterial, capillary, venous) changes.
    """
    prm = params or BoldParams()
    slab, n_slabs = _slab_volumes(graph, prm.slab_um)
    area = _column_area_m2(graph)
    base_d, cond_d = np.asarray(base_diameter), np.asarray(cond_diameter)
    base_y, cond_y = np.asarray(base_so2), np.asarray(cond_so2)

    def signal(d, y):
        """Extra- and intravascular signal per slab for given diameters and saturations."""
        v, deoxy, w, edge_of, sl, slab_volume = _slab_terms(graph, d, y, prm, slab, n_slabs, area)
        iv = _intravascular(prm, w, edge_of, sl, y, n_slabs, slab_volume)
        return _signal(prm, v, deoxy, iv)

    e0, i0 = signal(base_d, base_y)
    e1, i1 = signal(cond_d, cond_y)
    s0, s1 = e0 + i0, e1 + i1
    by_class = {}
    for name, types in CLASSES.items():
        m = np.isin(graph.vessel_type, types)
        e, i = signal(np.where(m, cond_d, base_d), np.where(m, cond_y, base_y))
        by_class[name] = float(100 * ((e + i).sum() / s0.sum() - 1))
    centers = (np.arange(n_slabs) + 0.5) * prm.slab_um
    return {
        "depth_um": centers.tolist(),
        "signal_change_pct": (100 * (s1 / s0 - 1)).tolist(),
        "extravascular_pct": (100 * (e1 - e0) / s0).tolist(),
        "intravascular_pct": (100 * (i1 - i0) / s0).tolist(),
        "column_signal_change_pct": float(100 * (s1.sum() / s0.sum() - 1)),
        "by_class_pct": by_class,
        "params": {k: getattr(prm, k) for k in prm.__dataclass_fields__},
    }
