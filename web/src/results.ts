// Summaries of a run for the Results window: per condition (converged,
// column inflow and its change from baseline) and per cortical layer, from
// the mesoscopic outputs stored with each solve (vascular/summary.py).
// Pure functions, tested without a browser.

import type { RunRecord } from "./api";

export type ConditionRow = {
  label: string;
  converged: boolean;
  iterations: number;
  inflow: number | null; // nL/s
  relInflow: number | null; // condition / baseline
  perfusion: number | null; // mL/min/100 mL
  capSpeed: number | null; // mm/s, column mean
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? a / b : null);

/** One row per solve: baseline first, then the conditions in run order. */
export function conditionRows(run: RunRecord): ConditionRow[] {
  const labels = Object.keys(run.results);
  const order = ["baseline", ...labels.filter((l) => l !== "baseline")].filter((l) => run.results[l]);
  const col = (l: string) => run.results[l].mesoscopic?.column;
  const base = num(col("baseline")?.column?.inflow_nl_s);
  return order.map((label) => {
    const f = run.results[label];
    const c = col(label);
    const inflow = num(c?.column?.inflow_nl_s);
    const regionSpeed = c?.regions ? num(Object.values(c.regions)[0]?.capillary_speed_mean_mm_s) : null;
    return {
      label,
      converged: f.converged,
      iterations: f.iterations,
      inflow,
      relInflow: label === "baseline" ? null : ratio(inflow, base),
      perfusion: num(c?.column?.perfusion_ml_min_100ml),
      capSpeed: regionSpeed,
    };
  });
}

/** Per-layer quantities shown when present, in this order, with labels and units. */
export const LAYER_COLUMNS: { key: string; label: string; unit: string; digits?: number; percent?: boolean }[] = [
  { key: "capillary_speed_mean_mm_s", label: "Capillary speed", unit: "mm/s" },
  { key: "capillary_slow_fraction", label: "Slow capillaries", unit: "%", percent: true },
  { key: "capillary_rbc_flow_mean_pl_s", label: "RBC flow", unit: "pL/s" },
  { key: "capillary_pressure_mean_mmhg", label: "Capillary pressure", unit: "mmHg" },
  { key: "blood_volume_fraction", label: "Blood volume", unit: "%", percent: true },
];

export type LayerRow = { region: string; values: Record<string, number | null>; rel: Record<string, number | null> };

/**
 * The per-layer table of one condition (or the baseline), with each value's
 * ratio to the baseline; null when the run has no layer summaries.
 */
export function layerRows(run: RunRecord, label: string): { columns: typeof LAYER_COLUMNS; rows: LayerRow[] } | null {
  const layer = run.results[label]?.mesoscopic?.layer;
  if (!layer?.regions || !Object.keys(layer.regions).length) return null;
  const base = run.results.baseline?.mesoscopic?.layer?.regions ?? {};
  const regions = Object.keys(layer.regions);
  const columns = LAYER_COLUMNS.filter((c) => regions.some((r) => num(layer.regions[r]?.[c.key]) !== null));
  const rows = regions.map((region) => {
    const values: Record<string, number | null> = {};
    const rel: Record<string, number | null> = {};
    for (const c of columns) {
      values[c.key] = num(layer.regions[region]?.[c.key]);
      rel[c.key] = label === "baseline" ? null : ratio(values[c.key], num(base[region]?.[c.key]));
    }
    return { region, values, rel };
  });
  return { columns, rows };
}
