import { describe, expect, it } from "vitest";
import type { Condition, Graph, RunRecord } from "./api";
import { DIVERGING } from "./colors";
import { buildCondition, conditionParts } from "./conditions";
import { colorByOptions, computeView } from "./viz";

describe("conditions with a CMRO2 change", () => {
  const c: Condition = { label: "act", perturbations: [{ name: "scale_diameter", params: { layers: [3], factor: 1.2 } }] };
  it("adds CMRO2 on the same layers and removes it again", () => {
    const withM = buildCondition(c, conditionParts(c).diameter, 1.1);
    expect(withM.perturbations[1]).toEqual({ name: "scale_cmro2", params: { factor: 1.1, layers: [3], depth_range_um: null } });
    expect(conditionParts(withM).cmro2).toBe(1.1);
    const without = buildCondition(withM, conditionParts(withM).diameter, null);
    expect(without.perturbations.map((p) => p.name)).toEqual(["scale_diameter"]);
  });
  it("keeps the CMRO2 region in step with the diameter region", () => {
    const withM = buildCondition(c, conditionParts(c).diameter, 1.1);
    const moved = buildCondition(withM, { ...conditionParts(withM).diameter, layers: [2] }, conditionParts(withM).cmro2);
    expect((moved.perturbations[1].params as { layers: number[] }).layers).toEqual([2]);
  });
});

describe("oxygen colour modes", () => {
  const graph: Graph = {
    n_nodes: 3, n_edges: 2, positions: [[0, 0, 0], [1e-4, 0, 0], [2e-4, 0, 0]], edges: [[0, 1], [1, 2]],
    diameter: [1e-5, 5e-6], length: [1e-4, 1e-4], vessel_type: ["ARTERIOLE", "CAPILLARY"], meta: {},
  };
  const f = (so2: number[]) => ({
    pressure: [0, 0, 0], flow: [1e-12, 1e-12], hematocrit: [0.45, 0.45], viscosity: [1, 1], diameter: [1e-5, 5e-6],
    iterations: 1, converged: true, po2: [90, 40], so2,
  });
  const run: RunRecord = {
    id: "r", spec: { name: "t", network: { name: "n", params: {} }, solver: {}, conditions: [], spec_version: 1 },
    created: "", provenance: {}, results: { baseline: f([0.9, 0.6]), act: f([0.9, 0.7]) },
    summary: { act: { relative_flow: [1, 1], hematocrit_change: [0, 0] } },
  };
  it("offers PO2, SO2 and SO2 change when a run has oxygen", () => {
    const labels = colorByOptions(run, graph).map((o) => o.label);
    expect(labels).toContain("PO2: baseline");
    expect(labels).toContain("SO2 change: act");
  });
  it("shows SO2 change on the diverging scale", () => {
    const v = computeView(graph, run, { kind: "so2change", label: "act" });
    expect(v.legend.kind).toBe("diverging");
    expect(v.colors[0]).toBe(DIVERGING.mid); // unchanged
    expect(v.colors[1]).toBe(DIVERGING.high); // +10 points, at the limit
  });
});
