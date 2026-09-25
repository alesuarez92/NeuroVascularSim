import { describe, expect, it } from "vitest";
import type { Condition, Graph, NetworkStats } from "./api";
import { SEGMENT_COLORS } from "./colors";
import { MAX_ROWS, tableRows } from "./EdgeTable";
import { formatList, paramKind, parseList } from "./params";
import { statRows, verdict } from "./stats";
import { addEdgeToCondition, computeView, visibleEdges } from "./viz";

const graph: Graph = {
  n_nodes: 4,
  n_edges: 3,
  positions: [[0, 0, 0], [0, 0, 1e-4], [0, 0, 2e-4], [0, 0, 3e-4]],
  edges: [[0, 1], [1, 2], [2, 3]],
  diameter: [2e-5, 4e-6, 1e-5],
  length: [1e-4, 1e-4, 1e-4],
  vessel_type: ["PENETRATING_ARTERIOLE", "CAPILLARY", "ASCENDING_VENULE"],
  depth: [0, 1e-4, 2e-4, 3e-4],
  meta: {},
};

describe("vessel segment and diameter colours", () => {
  it("colours each segment within its class hue and lists only present segments", () => {
    const v = computeView(graph, null, { kind: "segment" });
    expect(v.colors).toEqual([SEGMENT_COLORS.PENETRATING_ARTERIOLE, SEGMENT_COLORS.CAPILLARY, SEGMENT_COLORS.ASCENDING_VENULE]);
    expect(v.legend.kind === "categorical" && v.legend.items.map((i) => i.label)).toEqual([
      "Penetrating arteriole",
      "Capillary",
      "Ascending venule",
    ]);
  });

  it("maps diameter on a log scale between the extremes", () => {
    const v = computeView(graph, null, { kind: "diameter" });
    expect(v.legend).toMatchObject({ kind: "sequential", min: 4, max: 20, unit: "µm" });
    expect(new Set(v.colors).size).toBe(3);
  });
});

describe("visibleEdges", () => {
  it("hides classes and keeps a depth slab", () => {
    expect(visibleEdges(graph, { hidden: ["capillary"] })).toEqual([true, false, true]);
    expect(visibleEdges(graph, { hidden: [], depthUm: [100, 200] })).toEqual([false, true, false]);
  });
});

describe("addEdgeToCondition", () => {
  const conds: Condition[] = [
    { label: "a", perturbations: [{ name: "scale_diameter", params: { vessel_types: ["CAPILLARY"], factor: 1.2 } }] },
  ];
  it("adds the edge to an existing condition once", () => {
    const once = addEdgeToCondition(conds, 0, 7);
    expect(once[0].perturbations[0].params).toEqual({ vessel_types: ["CAPILLARY"], factor: 1.2, edges: [7] });
    expect(addEdgeToCondition(once, 0, 7)).toEqual(once);
    expect(conds[0].perturbations[0].params.edges).toBeUndefined(); // not mutated
  });
  it("creates a uniquely named condition", () => {
    const one = addEdgeToCondition(conds, "new", 7);
    const two = addEdgeToCondition(one, "new", 7);
    expect(two.map((c) => c.label)).toEqual(["a", "dilate_vessel_7", "dilate_vessel_7_2"]);
    expect(two[1].perturbations[0].params).toEqual({ edges: [7], factor: 1.3 });
  });
});

describe("parameter editing", () => {
  it("picks an input from the default, choices and name", () => {
    expect(paramKind("boundary", "penetrating_tops", ["penetrating_tops", "pial_tree"])).toBe("choice");
    expect(paramKind("prepare", true)).toBe("boolean");
    expect(paramKind("seed", 0)).toBe("number");
    expect(paramKind("nodes_file", "nodes.csv")).toBe("file");
    expect(paramKind("crop_lo_um", null)).toBe("list");
  });
  it("parses and formats lists", () => {
    expect(parseList("0, 100.5,  x")).toEqual([0, 100.5, "x"]);
    expect(parseList("  ")).toBeNull();
    expect(formatList([1, 2])).toBe("1, 2");
    expect(formatList(null)).toBe("");
  });
});

describe("network statistics against measurements", () => {
  const stats: NetworkStats = {
    statistics: {
      volume_mm3: 0.4,
      n_nodes: 10,
      n_edges: 12,
      capillary: {
        length_um: { n: 10, median: 36, mean: 40, p10: 20, p90: 60 },
        diameter_um: { n: 10, median: 4, mean: 4, p10: 3, p90: 5 },
        length_density_m_per_mm3: 0.9,
        volume_fraction: 0.008,
      },
      vascular_volume_fraction: 0.01,
      degree_fractions: { "1": 0.1, "2": 0.1, "3": 0.72, "4": 0.08 },
    },
    branch_order: { mean_order_from_arterial: 4, mean_order_from_venous: 4, mean_order_nearest: 3.5, median_arterial_to_venous_path: null },
  };
  const rows = Object.fromEntries(statRows(stats).map((r) => [r.label, r]));
  it("derives shares and flags each against its range", () => {
    expect(rows["Capillary share of vascular volume"].value).toBeCloseTo(0.8);
    expect(rows["Capillary share of vascular length"].value).toBe(1); // no arterial or venous vessels here
    expect(verdict(rows["Capillary length density"])).toBe("in");
    expect(verdict(rows["Capillary segment length, median"])).toBe("out");
    expect(verdict(rows["Arteriole-to-venule path, median"])).toBe("none");
    expect(verdict(rows["Segments"])).toBe("none");
    expect(rows["Junctions of degree 3"].value).toBeCloseTo(0.9); // among branch points only
    expect(verdict(rows["Tissue-to-vessel distance, mean"])).toBe("none"); // not computed
  });
});

describe("tableRows", () => {
  it("caps large tables and keeps the selected vessel", () => {
    expect(tableRows(3, null)).toEqual([0, 1, 2]);
    const rows = tableRows(10_000, 9_000);
    expect(rows.length).toBe(MAX_ROWS + 1);
    expect(rows[0]).toBe(9_000);
  });
});
