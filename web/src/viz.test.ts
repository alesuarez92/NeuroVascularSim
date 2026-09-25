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
    expect(colorByOptions(null)).toHaveLength(3); // type, segment, diameter
  });
});

describe("cortical networks", () => {
  const cortical: Graph = {
    ...graph,
    depth: [0, 3e-4, 6e-4],
    layer: [1, 2, 3],
    meta: { layer_names: ["L1", "L2/3", "L4", "L5", "L6"] },
  };

  it("offers layer and depth colouring only when the graph has them", () => {
    expect(colorByOptions(null, cortical).map((o) => o.label)).toEqual([
      "Vessel type",
      "Vessel segment",
      "Diameter",
      "Cortical layer",
      "Cortical depth",
    ]);
    expect(colorByOptions(null, graph)).toHaveLength(3);
  });

  it("colours layers in order with one legend entry per layer", () => {
    const v = computeView(cortical, null, { kind: "layer" });
    expect(v.legend.kind).toBe("categorical");
    if (v.legend.kind === "categorical") expect(v.legend.items.map((i) => i.label)).toEqual(["L1", "L2/3", "L4", "L5", "L6"]);
    expect(v.colors[0]).not.toBe(v.colors[1]);
  });

  it("colours depth from the pia down", () => {
    const v = computeView(cortical, null, { kind: "depth" });
    expect(v.legend).toMatchObject({ kind: "sequential", min: 0, unit: "µm" });
  });
});

describe("flow change scale", () => {
  it("ignores edges with almost no baseline flow", () => {
    const g2: Graph = { ...graph, n_edges: 3, edges: [[0, 1], [1, 2], [0, 2]], diameter: [1e-5, 1e-5, 1e-5], length: [1e-4, 1e-4, 1e-4], vessel_type: ["CAPILLARY", "CAPILLARY", "CAPILLARY"] };
    const r: RunRecord = {
      ...run,
      results: { baseline: fields([1e-12, 1e-12, 1e-20], [0.45, 0.45, 0.45]) },
      summary: { c: { relative_flow: [1.1, 0.95, 500], hematocrit_change: [0, 0, 0] } },
    };
    const v = computeView(g2, r, { kind: "relflow", label: "c" });
    expect(v.legend).toMatchObject({ kind: "diverging", limit: 10 });
    expect(v.colors[2]).toBe(DIVERGING.mid);
  });
});
