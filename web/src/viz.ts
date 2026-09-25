// What the viewer shows: colours per edge plus the matching legend, for a
// chosen field. Pure functions, so they are tested without a browser.

import type { Graph, RunRecord } from "./api";
import { CLASS_COLORS, CLASS_LABELS, type VesselClass, diverging, sequential, symmetricLimit, vesselClass } from "./colors";
import { toNlPerMin } from "./units";

export type ColorBy =
  | { kind: "type" }
  | { kind: "relflow"; label: string }
  | { kind: "hematocrit"; label: string }
  | { kind: "flow"; label: string };

export type Legend =
  | { kind: "categorical"; title: string; items: { color: string; label: string }[] }
  | { kind: "diverging"; title: string; limit: number; unit: string }
  | { kind: "sequential"; title: string; min: number; max: number; unit: string };

export function colorByOptions(run: RunRecord | null): { value: ColorBy; label: string }[] {
  const opts: { value: ColorBy; label: string }[] = [{ value: { kind: "type" }, label: "Vessel type" }];
  if (!run) return opts;
  for (const label of Object.keys(run.summary)) {
    opts.push({ value: { kind: "relflow", label }, label: `Flow change: ${label}` });
  }
  for (const label of Object.keys(run.results)) {
    opts.push({ value: { kind: "flow", label }, label: `Flow: ${label}` });
    opts.push({ value: { kind: "hematocrit", label }, label: `Hematocrit: ${label}` });
  }
  return opts;
}

export const colorByKey = (c: ColorBy) => (c.kind === "type" ? "type" : `${c.kind}:${c.label}`);

export function computeView(graph: Graph, run: RunRecord | null, by: ColorBy): { colors: string[]; legend: Legend } {
  if (by.kind === "type" || !run) {
    const present = [...new Set(graph.vessel_type.map(vesselClass))] as VesselClass[];
    const order: VesselClass[] = ["arterial", "capillary", "venous"];
    return {
      colors: graph.vessel_type.map((t) => CLASS_COLORS[vesselClass(t)]),
      legend: {
        kind: "categorical",
        title: "Vessel type",
        items: order.filter((c) => present.includes(c)).map((c) => ({ color: CLASS_COLORS[c], label: CLASS_LABELS[c] })),
      },
    };
  }
  if (by.kind === "relflow") {
    const rel = run.summary[by.label]?.relative_flow ?? [];
    const change = rel.map((r) => (r === null ? Number.NaN : (r - 1) * 100));
    const limit = symmetricLimit(change);
    return {
      colors: change.map((c) => diverging(c, limit)),
      legend: { kind: "diverging", title: `Flow change vs baseline (${by.label})`, limit, unit: "%" },
    };
  }
  const fields = run.results[by.label];
  const values =
    by.kind === "flow" ? fields.flow.map((q) => toNlPerMin(Math.abs(q))) : fields.hematocrit.slice();
  const finite = values.filter(Number.isFinite);
  const min = by.kind === "flow" ? 0 : Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  return {
    colors: values.map((v) => sequential(span > 1e-12 ? (v - min) / span : 0.5)),
    legend: {
      kind: "sequential",
      title: by.kind === "flow" ? `Blood flow (${by.label})` : `Discharge hematocrit (${by.label})`,
      min,
      max,
      unit: by.kind === "flow" ? "nL/min" : "",
    },
  };
}
