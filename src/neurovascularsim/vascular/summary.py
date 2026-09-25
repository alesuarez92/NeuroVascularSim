"""Mesoscopic summaries of a detailed flow solution.

A summary reduces per-vessel fields to a few numbers per region: the whole
column, each cortical layer, or depth bins. These are the outputs a coarse
(mesoscopic) model has to reproduce, and every detailed run stores them, so
runs can later serve as training data for learned mesoscopic models (see
docs/VISION.md, design principles).

Only definitions, no literature values: speeds are flow / lumen area,
red-cell flow is blood flow x discharge hematocrit, and perfusion is inflow
per tissue volume (mL/min per 100 mL; divide by tissue density for per 100 g).
"""
from __future__ import annotations

import numpy as np

from ..units import MMHG, UM
from .graph import VascularGraph, VesselType

RESOLUTIONS = ("column", "layer", "depth")
SLOW_SPEED_MM_S = 0.1  # threshold for "slow" capillaries (definition, not a measured value)


def _regions(graph: VascularGraph, resolution: str, bin_um: float):
    """Region names, region index per edge (-1 = none) and each region's depth bounds (um)."""
    if resolution == "column" or graph.depth is None:
        return ["column"], np.zeros(graph.n_edges, dtype=int), None
    z = 0.5 * (graph.depth[graph.edges[:, 0]] + graph.depth[graph.edges[:, 1]]) / UM
    if resolution == "layer":
        from .cortex import LAYER_BOUNDS_UM, LAYER_NAMES, layer_of_depth

        return list(LAYER_NAMES), layer_of_depth(z) - 1, np.array(LAYER_BOUNDS_UM)
    if resolution == "depth":
        n = int(np.ceil(max(z.max(), bin_um) / bin_um))
        idx = np.clip((z // bin_um).astype(int), 0, n - 1)
        return [f"{i * bin_um:g}-{(i + 1) * bin_um:g}" for i in range(n)], idx, np.arange(n + 1) * bin_um
    raise ValueError(f"resolution must be one of {RESOLUTIONS}")


def _stats(graph, flow, hematocrit, pressure, mask, volume_mm3) -> dict:
    cap = mask & (graph.vessel_type == VesselType.CAPILLARY)
    area = np.pi * (graph.diameter / 2) ** 2
    speed = np.abs(flow) / area * 1e3  # mm/s
    v = speed[cap]
    p_mid = 0.5 * (pressure[graph.edges[:, 0]] + pressure[graph.edges[:, 1]]) / MMHG
    out = {
        "n_capillaries": int(cap.sum()),
        "blood_volume_fraction": float((area * graph.length)[mask].sum() * 1e9 / volume_mm3) if volume_mm3 else None,
    }
    if cap.any():
        out.update({
            "capillary_speed_mean_mm_s": float(v.mean()),
            "capillary_speed_median_mm_s": float(np.median(v)),
            "capillary_speed_cv": float(v.std() / v.mean()) if v.mean() > 0 else None,
            "capillary_slow_fraction": float(np.mean(v < SLOW_SPEED_MM_S)),
            "capillary_rbc_flow_mean_pl_s": float((np.abs(flow) * hematocrit)[cap].mean() * 1e15),
            "capillary_pressure_mean_mmhg": float(p_mid[cap].mean()),
        })
    return out


def flow_summary(graph: VascularGraph, flow, hematocrit, pressure, pressure_bc: dict[int, float],
                 resolution: str = "column", bin_um: float = 100.0) -> dict:
    """Summarise a flow solution at the chosen resolution.

    Args:
        flow, hematocrit, pressure: per-edge flow (m^3/s), discharge
            hematocrit, and per-node pressure (Pa) from :func:`solve_flow`.
        pressure_bc: the fixed-pressure nodes; blood entering through them
            is the column inflow.
        resolution: "column", "layer" (cortical layers, needs depth) or
            "depth" (bins of ``bin_um``).
    """
    flow, hematocrit, pressure = (np.asarray(a, dtype=float) for a in (flow, hematocrit, pressure))
    volume = graph.meta.get("volume_mm3")
    names, region, bounds = _regions(graph, resolution, bin_um)
    depth_um = graph.depth.max() / UM if graph.depth is not None else None

    net = np.zeros(graph.n_nodes)
    np.add.at(net, graph.edges[:, 0], flow)
    np.add.at(net, graph.edges[:, 1], -flow)
    bc = np.array(list(pressure_bc), dtype=int)
    inflow = float(net[bc][net[bc] > 0].sum()) if bc.size else 0.0
    inlets = bc[net[bc] > 0] if bc.size else bc
    outlets = bc[net[bc] < 0] if bc.size else bc

    column = {
        "inflow_nl_s": inflow * 1e12,
        "perfusion_ml_min_100ml": inflow * 6e7 / (volume * 1e-3) * 100 if volume else None,
        "inlet_pressure_mean_mmhg": float(pressure[inlets].mean() / MMHG) if inlets.size else None,
        "outlet_pressure_mean_mmhg": float(pressure[outlets].mean() / MMHG) if outlets.size else None,
    }
    regions = {}
    for i, name in enumerate(names):
        mask = region == i
        if not mask.any():
            continue
        # Tissue volume of a slab: the column volume times its share of the depth.
        vol = volume
        if volume and bounds is not None and depth_um:
            overlap = min(bounds[i + 1], depth_um) - min(bounds[i], depth_um)
            vol = volume * overlap / depth_um if overlap > 0 else None
        regions[name] = _stats(graph, flow, hematocrit, pressure, mask, vol)
    return {"resolution": resolution, "column": column, "regions": regions}
