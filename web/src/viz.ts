// What the viewer shows: colours per edge plus the matching legend, for a
// chosen field. Pure functions, so they are tested without a browser.

import type { Graph, RunRecord } from "./api";
import { CLASS_COLORS, CLASS_LABELS, type VesselClass, diverging, sequential, symmetricLimit, vesselClass } from "./colors";
import { toNlPerMin } from "./units";

export type ColorBy =
  | { kind: "type" }
  | { kind: "layer" }
  | { kind: "depth" }
  | { kind: "relflow"; label: string }
  | { kind: "hematocrit"; label: string }
  | { kind: "flow"; label: string };

export type Legend =
  | { kind: "categorical"; title: string; items: { color: string; label: string }[] }
  | { kind: "diverging"; title: string; limit: number; unit: string }
  | { kind: "sequential"; title: string; min: number; max: number; unit: string };

export function colorByOptions(run: RunRecord | null, graph?: Graph): { value: ColorBy; label: string }[] {
  const opts: { value: ColorBy; label: string }[] = [{ value: { kind: "type" }, label: "Vessel type" }];
  if (graph?.layer) opts.push({ value: { kind: "layer" }, label: "Cortical layer" });
  if (graph?.depth) opts.push({ value: { kind: "depth" }, label: "Cortical depth" });
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

export const colorByKey = (c: ColorBy) => ("label" in c ? `${c.kind}:${c.label}` : c.kind);

/** Mean of a per-node array over each edge's two end nodes. */
const edgeMean = (graph: Graph, perNode: number[]) => graph.edges.map(([a, b]) => 0.5 * (perNode[a] + perNode[b]));

export function computeView(graph: Graph, run: RunRecord | null, by: ColorBy): { colors: string[]; legend: Legend } {
  if (by.kind === "layer" && graph.layer) {
    // Layers are ordered, so they take evenly spaced steps of the sequential ramp.
    const names = (graph.meta.layer_names as string[] | undefined) ?? [];
    const n = Math.max(names.length, ...graph.layer);
    const step = (i: number) => sequential(n > 1 ? (i - 1) / (n - 1) : 0.5);
    const layerOfEdge = graph.edges.map(([a]) => graph.layer![a]);
    return {
      colors: layerOfEdge.map((l) => (l > 0 ? step(l) : "#c3c2b7")),
      legend: {
        kind: "categorical",
        title: "Cortical layer",
        items: Array.from({ length: n }, (_, i) => ({ color: step(i + 1), label: names[i] ?? `Layer ${i + 1}` })),
      },
    };
  }
  if (by.kind === "depth" && graph.depth) {
    const depthUm = edgeMean(graph, graph.depth).map((d) => d * 1e6);
    const max = Math.max(...depthUm);
    return {
      colors: depthUm.map((d) => sequential(max > 0 ? d / max : 0)),
      legend: { kind: "sequential", title: "Depth below the pia", min: 0, max, unit: "µm" },
    };
  }
  if (by.kind === "type" || by.kind === "layer" || by.kind === "depth" || !run) {
    const present = [...new Set(graph.vessel_type.map(vesselClass))] as VesselClass[];
    const order: VesselClass[] = ["arterial", "capillary", "venous", "unclassified"];
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
    // Relative change is meaningless where the baseline flow is almost zero
    // (it can reach thousands of percent); those edges are shown as neutral.
    const base = run.results.baseline.flow.map(Math.abs);
    const floor = 1e-3 * Math.max(...base);
    const change = rel.map((r, k) => (r === null || base[k] < floor ? Number.NaN : (r - 1) * 100));
    const finite = change.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    const p95 = finite.length ? finite[Math.ceil(0.95 * finite.length) - 1] : 0; // nearest-rank
    const limit = symmetricLimit([p95]);
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
