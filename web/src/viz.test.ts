import { describe, expect, it } from "vitest";
import type { Graph, RunRecord } from "./api";
import { CLASS_COLORS, DIVERGING } from "./colors";
import { colorByOptions, computeView } from "./viz";

const graph: Graph = {
  n_nodes: 3,
  n_edges: 2,
  positions: [[0, 0, 0], [1e-4, 0, 0], [2e-4, 0, 0]],
  edges: [[0, 1], [1, 2]],
  diameter: [1e-5, 8e-6],
  length: [1e-4, 1e-4],
  vessel_type: ["ARTERIOLE", "CAPILLARY"],
  meta: {},
};

const fields = (flow: number[], hct: number[]) => ({
  pressure: [0, 0, 0], flow, hematocrit: hct, viscosity: [1, 1], diameter: [1e-5, 8e-6], iterations: 1, converged: true,
});

const run: RunRecord = {
  id: "abc",
  spec: { name: "t", network: { name: "n", params: {} }, solver: {}, conditions: [], spec_version: 1 },
  created: "",
  provenance: {},
  results: { baseline: fields([1e-12, 2e-12], [0.45, 0.45]), dilated: fields([1.1e-12, 1.9e-12], [0.44, 0.47]) },
  summary: { dilated: { relative_flow: [1.1, 0.95], hematocrit_change: [-0.01, 0.02] } },
};

describe("computeView", () => {
  it("colours by vessel type with a categorical legend", () => {
    const v = computeView(graph, null, { kind: "type" });
    expect(v.colors).toEqual([CLASS_COLORS.arterial, CLASS_COLORS.capillary]);
    expect(v.legend.kind).toBe("categorical");
  });

  it("colours flow change on a symmetric diverging scale", () => {
    const v = computeView(graph, run, { kind: "relflow", label: "dilated" });
    expect(v.legend).toMatchObject({ kind: "diverging", limit: 10 });
    expect(v.colors[0]).toBe(DIVERGING.high); // +10% at the limit
    expect(v.colors[1]).not.toBe(DIVERGING.mid);
  });

  it("colours hematocrit on a sequential scale with its range", () => {
    const v = computeView(graph, run, { kind: "hematocrit", label: "dilated" });
    expect(v.legend).toMatchObject({ kind: "sequential", min: 0.44, max: 0.47 });
  });

  it("lists options for every condition and field", () => {
    const labels = colorByOptions(run).map((o) => o.label);
    expect(labels).toContain("Flow change: dilated");
    expect(labels).toContain("Hematocrit: baseline");
    expect(colorByOptions(null)).toHaveLength(1);
  });
});
