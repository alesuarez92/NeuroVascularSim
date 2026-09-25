// What the viewer shows: colours per edge plus the matching legend, for a
// chosen field. Pure functions, so they are tested without a browser.

import type { Condition, Graph, RunRecord } from "./api";
import {
  CLASS_COLORS,
  CLASS_LABELS,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  type VesselClass,
  diverging,
  sequential,
  symmetricLimit,
  vesselClass,
} from "./colors";
import { toNlPerMin } from "./units";

export type ColorBy =
  | { kind: "type" }
  | { kind: "segment" }
  | { kind: "diameter" }
  | { kind: "layer" }
  | { kind: "depth" }
  | { kind: "relflow"; label: string }
  | { kind: "hematocrit"; label: string }
  | { kind: "flow"; label: string }
  | { kind: "po2"; label: string }
  | { kind: "so2"; label: string }
  | { kind: "so2change"; label: string };

export type Legend =
  | { kind: "categorical"; title: string; items: { color: string; label: string }[] }
  | { kind: "diverging"; title: string; limit: number; unit: string }
  | { kind: "sequential"; title: string; min: number; max: number; unit: string };

export function colorByOptions(run: RunRecord | null, graph?: Graph): { value: ColorBy; label: string }[] {
  const opts: { value: ColorBy; label: string }[] = [
    { value: { kind: "type" }, label: "Vessel type" },
    { value: { kind: "segment" }, label: "Vessel segment" },
    { value: { kind: "diameter" }, label: "Diameter" },
  ];
  if (graph?.layer) opts.push({ value: { kind: "layer" }, label: "Cortical layer" });
  if (graph?.depth) opts.push({ value: { kind: "depth" }, label: "Cortical depth" });
  if (!run) return opts;
  for (const label of Object.keys(run.summary)) {
    opts.push({ value: { kind: "relflow", label }, label: `Flow change: ${label}` });
  }
  for (const label of Object.keys(run.results)) {
    opts.push({ value: { kind: "flow", label }, label: `Flow: ${label}` });
    opts.push({ value: { kind: "hematocrit", label }, label: `Hematocrit: ${label}` });
    if (run.results[label].po2) {
      opts.push({ value: { kind: "po2", label }, label: `PO2: ${label}` });
      opts.push({ value: { kind: "so2", label }, label: `SO2: ${label}` });
    }
  }
  for (const label of Object.keys(run.summary)) {
    if (run.results[label]?.so2 && run.results.baseline?.so2) {
      opts.push({ value: { kind: "so2change", label }, label: `SO2 change: ${label}` });
    }
  }
  return opts;
}

export const colorByKey = (c: ColorBy) => ("label" in c ? `${c.kind}:${c.label}` : c.kind);

/** Mean of a per-node array over each edge's two end nodes. */
const edgeMean = (graph: Graph, perNode: number[]) => graph.edges.map(([a, b]) => 0.5 * (perNode[a] + perNode[b]));

export function computeView(graph: Graph, run: RunRecord | null, by: ColorBy): { colors: string[]; legend: Legend } {
  if (by.kind === "segment") {
    const present = new Set(graph.vessel_type);
    return {
      colors: graph.vessel_type.map((t) => SEGMENT_COLORS[t] ?? CLASS_COLORS.unclassified),
      legend: {
        kind: "categorical",
        title: "Vessel segment",
        items: SEGMENT_ORDER.filter((t) => present.has(t)).map((t) => ({ color: SEGMENT_COLORS[t], label: SEGMENT_LABELS[t] })),
      },
    };
  }
  if (by.kind === "diameter") {
    // Diameters span an order of magnitude (capillaries to pial vessels): a log scale.
    const d = graph.diameter.map((x) => x * 1e6);
    const lo = Math.min(...d);
    const hi = Math.max(...d);
    const span = Math.log(hi / lo);
    return {
      colors: d.map((x) => sequential(span > 1e-12 ? Math.log(x / lo) / span : 0.5)),
      legend: { kind: "sequential", title: "Diameter (log scale)", min: lo, max: hi, unit: "µm" },
    };
  }
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
  if (by.kind === "so2change") {
    const base = run.results.baseline.so2 ?? [];
    const cond = run.results[by.label]?.so2 ?? [];
    const change = cond.map((y, k) => (y - base[k]) * 100); // percentage points
    const finite = change.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    const limit = symmetricLimit([finite.length ? finite[Math.ceil(0.95 * finite.length) - 1] : 0]);
    return {
      colors: change.map((c) => diverging(c, limit)),
      legend: { kind: "diverging", title: `SO2 change vs baseline (${by.label}), points`, limit, unit: "" },
    };
  }
  if (by.kind === "po2" || by.kind === "so2") {
    const f = run.results[by.label];
    const vals = (by.kind === "po2" ? f.po2 : f.so2?.map((y) => y * 100)) ?? [];
    const max = by.kind === "po2" ? Math.max(...vals.filter(Number.isFinite), 1) : 100;
    return {
      colors: vals.map((v) => sequential(v / max)),
      legend: {
        kind: "sequential",
        title: by.kind === "po2" ? `Vessel PO2 (${by.label})` : `Hemoglobin saturation (${by.label})`,
        min: 0,
        max,
        unit: by.kind === "po2" ? "mmHg" : "%",
      },
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

export type ViewFilter = {
  hidden: VesselClass[]; // vessel classes not drawn
  depthUm?: [number, number]; // draw only edges whose mean depth is in this slab
};

/** Which edges to draw. */
export function visibleEdges(graph: Graph, f: ViewFilter): boolean[] {
  const hidden = new Set(f.hidden);
  const depth = graph.depth && f.depthUm ? edgeMean(graph, graph.depth).map((d) => d * 1e6) : null;
  return graph.vessel_type.map((t, k) => {
    if (hidden.has(vesselClass(t))) return false;
    if (depth && (depth[k] < f.depthUm![0] || depth[k] > f.depthUm![1])) return false;
    return true;
  });
}

/**
 * Conditions with ``edge`` added to the edges dilated by condition ``index``
 * (its first scale_diameter perturbation), or to a new condition dilating
 * only that edge by 30%.
 */
export function addEdgeToCondition(conditions: Condition[], index: number | "new", edge: number): Condition[] {
  if (index === "new") {
    const taken = new Set(conditions.map((c) => c.label));
    let label = `dilate_vessel_${edge}`;
    for (let i = 2; taken.has(label); i++) label = `dilate_vessel_${edge}_${i}`;
    return [...conditions, { label, perturbations: [{ name: "scale_diameter", params: { edges: [edge], factor: 1.3 } }] }];
  }
  return conditions.map((c, i) => {
    if (i !== index) return c;
    const [first, ...rest] = c.perturbations.length ? c.perturbations : [{ name: "scale_diameter", params: { factor: 1.3 } }];
    const edges = (first.params.edges as (number | string)[] | undefined) ?? [];
    if (edges.includes(edge)) return c;
    return { ...c, perturbations: [{ ...first, params: { ...first.params, edges: [...edges, edge] } }, ...rest] };
  });
}
