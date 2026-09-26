import { describe, expect, it } from "vitest";
import type { ExperimentSpec, ParamDocs, Plugins } from "./api";
import { branchPositions, cmro2Fill, columnBox, depthSpan, dilation, hillSaturation, layerBands, normalCurvePath, rbcCount, trunkCounts, tubeWidth } from "./diagrams/geometry";
import { networkFigure, regionOfGroup, regionOfParam } from "./diagrams/regions";
import { conditionRows, layerRows } from "./results";
import { handleSyncMessage, shouldBroadcast } from "./sync";
import {
  OTHER_GROUP,
  PRESETS,
  changedSettings,
  checkSpec,
  countAdvanced,
  describePerturbation,
  filterLevel,
  firstSentence,
  groupFields,
  isChanged,
  linkify,
  networkStep,
  presetAvailability,
  resolveDoc,
  toggleIn,
  uniqueLabel,
} from "./wizard";

const docs: ParamDocs = {
  groups: ["Column size", "Capillary bed"],
  params: {
    depth_um: { label: "Column depth", help: "Depth below the pia. Second sentence.", unit: "µm", group: "Column size", level: "basic", source: "Hooks et al. 2011, doi:10.1371/journal.pbio.1000572." },
    capillary_diameter_sd_um: { label: "Capillary diameter spread", help: "", unit: "µm", group: "Capillary bed", level: "advanced", source: "" },
    tortuosity: { label: "Tortuosity", help: "", unit: "", group: "Shape", level: "basic", source: "" },
  },
};
const defaults = { depth_um: 1200, capillary_diameter_sd_um: 1, tortuosity: 1.27, seed: 0 };

describe("parameter docs", () => {
  it("falls back to the parameter name, group Other, advanced", () => {
    const r = resolveDoc("seed", docs);
    expect(r.documented).toBe(false);
    expect(r.doc).toMatchObject({ label: "seed", group: OTHER_GROUP, level: "advanced" });
    expect(resolveDoc("depth_um", docs).doc.label).toBe("Column depth");
    expect(resolveDoc("x", undefined).doc.group).toBe(OTHER_GROUP);
  });

  it("groups in the docs' order, unlisted groups after, Other last", () => {
    const g = groupFields(defaults, docs);
    expect(g.map((x) => x.group)).toEqual(["Column size", "Capillary bed", "Shape", OTHER_GROUP]);
    expect(g[3].fields.map((f) => f.name)).toEqual(["seed"]);
    expect(groupFields(defaults, undefined).map((x) => x.group)).toEqual([OTHER_GROUP]);
  });

  it("shows only basic fields unless advanced ones are asked for", () => {
    const g = groupFields(defaults, docs);
    const basic = filterLevel(g, false);
    expect(basic.map((x) => x.group)).toEqual(["Column size", "Shape"]);
    expect(filterLevel(g, true)).toBe(g);
    expect(countAdvanced(g)).toBe(2);
  });

  it("filters fields by an include rule", () => {
    const g = groupFields({ p_in_mmhg: 60, hematocrit: 0.45, depth_um: 1200 }, docs, undefined, (n, d) => networkStep(n, d) === "network");
    expect(g.flatMap((x) => x.fields.map((f) => f.name))).toEqual(["depth_um"]);
    expect(networkStep("p_in_mmhg")).toBe("bc");
    expect(networkStep("hematocrit")).toBe("blood");
    expect(networkStep("foo", { ...docs.params.depth_um, group: "Boundary conditions" })).toBe("bc");
  });

  it("detects values changed from the default", () => {
    expect(isChanged(undefined, 3)).toBe(false);
    expect(isChanged(3, 3)).toBe(false);
    expect(isChanged(4, 3)).toBe(true);
    expect(isChanged([], null)).toBe(false);
    expect(isChanged([1, 2], [1, 2])).toBe(false);
    expect(isChanged([1], [])).toBe(true);
    expect(isChanged(false, true)).toBe(true);
  });

  it("turns DOIs and URLs into links, leaving sentence punctuation out", () => {
    const parts = linkify("Hooks et al. 2011, doi:10.1371/journal.pbio.1000572. See https://example.org/x.");
    const links = parts.filter((p) => p.href);
    expect(links.map((p) => p.href)).toEqual(["https://doi.org/10.1371/journal.pbio.1000572", "https://example.org/x"]);
    expect(parts.map((p) => p.text).join("")).toBe("Hooks et al. 2011, doi:10.1371/journal.pbio.1000572. See https://example.org/x.");
    // Parentheses inside a DOI stay; one closing the sentence goes.
    expect(linkify("(doi:10.1016/S0006-3495(01)75708-6)").find((p) => p.href)!.href).toBe("https://doi.org/10.1016/S0006-3495(01)75708-6");
    expect(linkify("no links here")).toEqual([{ text: "no links here" }]);
  });

  it("takes the first sentence for tooltips", () => {
    expect(firstSentence("Depth below the pia. Second sentence.")).toBe("Depth below the pia.");
    expect(firstSentence("No full stop")).toBe("No full stop");
    expect(firstSentence("Ratio 1.27 of path to chord. More.")).toBe("Ratio 1.27 of path to chord.");
  });
});

const spec = (over: Partial<ExperimentSpec> = {}): ExperimentSpec => ({
  name: "t",
  network: { name: "mouse_cortex_synthetic", params: {} },
  solver: {},
  conditions: [],
  spec_version: 1,
  ...over,
});

describe("presets", () => {
  const ctx = { selected: 12, existing: ["arteriolar_dilation_20pct"], network: "mouse_cortex_synthetic" };
  it("produce valid perturbations with unique labels", () => {
    for (const p of PRESETS) {
      const c = p.build(ctx);
      expect(c.label).not.toBe("");
      expect(c.perturbations.length).toBeGreaterThan(0);
      for (const q of c.perturbations) {
        expect(["scale_diameter", "scale_cmro2"]).toContain(q.name);
        expect(Number((q.params as { factor: number }).factor)).toBeGreaterThan(0);
      }
      const withOxygen = spec({ conditions: [c], oxygen: {} });
      expect(checkSpec(withOxygen).filter((i) => i.level === "error")).toEqual([]);
    }
    expect(PRESETS[0].build(ctx).label).toBe("arteriolar_dilation_20pct_2");
    const dilate = PRESETS.find((p) => p.id === "dilate_selected")!.build(ctx);
    expect(dilate.perturbations[0].params).toEqual({ edges: [12], factor: 1.3 });
    const l4 = PRESETS.find((p) => p.id === "cmro2_l4")!.build(ctx);
    expect(l4.perturbations[0]).toEqual({ name: "scale_cmro2", params: { factor: 1.1, layers: [3], depth_range_um: null } });
  });

  it("say why they are unavailable", () => {
    const base = { hasLayers: true, oxygen: false, selected: null, network: "mouse_cortex_synthetic" };
    const by = (id: string) => PRESETS.find((p) => p.id === id)!;
    expect(presetAvailability(by("cmro2_l4"), base)).toMatch(/oxygen/);
    expect(presetAvailability(by("dilate_selected"), base)).toMatch(/vessel/);
    expect(presetAvailability(by("arteriolar_dilation"), base)).toBeNull();
    expect(presetAvailability(by("arteriolar_dilation"), { ...base, hasLayers: false })).not.toBeNull();
    expect(presetAvailability(by("dilate_active"), { ...base, network: "suarez2021a" })).toBeNull();
  });

  it("number labels", () => {
    expect(uniqueLabel("a", [])).toBe("a");
    expect(uniqueLabel("a", ["a", "a_2"])).toBe("a_3");
    expect(toggleIn([1, 2], 2)).toEqual([1]);
    expect(toggleIn([1], 3)).toEqual([1, 3]);
  });
});

describe("checks and review", () => {
  it("flags what the engine would refuse", () => {
    const bad = spec({
      conditions: [
        { label: "", perturbations: [{ name: "scale_diameter", params: { factor: 1.2 } }] },
        { label: "x", perturbations: [{ name: "scale_cmro2", params: { factor: 0 } }] },
        { label: "x", perturbations: [{ name: "scale_diameter", params: { layers: [3], depth_range_um: [500, 100] } }] },
      ],
      bold: {},
    });
    const msgs = checkSpec(bad).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/no label/);
    expect(msgs).toMatch(/which vessels/);
    expect(msgs).toMatch(/above 0/);
    expect(msgs).toMatch(/needs the oxygen/);
    expect(msgs).toMatch(/Two conditions/);
    expect(msgs).toMatch(/from < to/);
    expect(msgs).toMatch(/BOLD needs/);
    expect(checkSpec(spec({ conditions: [{ label: "baseline", perturbations: [] }] })).map((i) => i.level)).toEqual(["error", "warning"]);
  });

  it("lists settings changed from the defaults with their doc labels", () => {
    const plugins: Plugins = {
      network: { contract: "", plugins: [{ name: "mouse_cortex_synthetic", description: "", reference: "", parameters: defaults, choices: {}, docs }] },
    };
    const s = spec({ network: { name: "mouse_cortex_synthetic", params: { ...defaults, depth_um: 900 } }, solver: { viscosity: "pries_invitro", tol: 1e-4 } });
    const ch = changedSettings(s, plugins, {}, null, { viscosity: "pries_invitro" });
    expect(ch.map((c) => [c.section, c.label, c.value])).toEqual([["Network", "Column depth", 900], ["Solver", "tol", 1e-4]]);
  });

  it("describes perturbations in plain words", () => {
    expect(describePerturbation({ name: "scale_diameter", params: { vessel_types: ["PENETRATING_ARTERIOLE"], factor: 1.2, layers: [3] } }))
      .toBe("Diameter +20% (×1.2) of penetrating arterioles in L4");
    expect(describePerturbation({ name: "scale_cmro2", params: { factor: 0.9, depth_range_um: [100, 300] } }))
      .toBe("Oxygen consumption −10% (×0.9) 100–300 µm deep");
    expect(describePerturbation({ name: "scale_diameter", params: { edges: ["active_edge"], factor: 1.3 } })).toMatch(/vessel active edge/);
  });
});

describe("sync messages", () => {
  const s = spec();
  it("ignore our own and malformed messages, and echoes of the current spec", () => {
    expect(handleSyncMessage({ source: "me", kind: "spec", spec: s }, "me", "", null).kind).toBe("none");
    expect(handleSyncMessage(null, "me", "", null).kind).toBe("none");
    expect(handleSyncMessage({ kind: "spec", spec: s }, "me", "", null).kind).toBe("none");
    expect(handleSyncMessage({ source: "o", kind: "spec", spec: s }, "me", JSON.stringify(s), null).kind).toBe("none");
    expect(handleSyncMessage({ source: "o", kind: "run", runId: 5 }, "me", "", null).kind).toBe("none");
    expect(handleSyncMessage({ source: "o", kind: "popin", window: "nope" }, "me", "", null).kind).toBe("none");
  });
  it("apply other windows' changes", () => {
    const a = handleSyncMessage({ source: "o", kind: "spec", spec: s }, "me", "{}", null);
    expect(a).toEqual({ kind: "spec", spec: s, json: JSON.stringify(s) });
    expect(handleSyncMessage({ source: "o", kind: "run", runId: "r1" }, "me", "", null)).toEqual({ kind: "run", runId: "r1" });
    expect(handleSyncMessage({ source: "o", kind: "run", runId: "r1" }, "me", "", "r1").kind).toBe("none");
    expect(handleSyncMessage({ source: "o", kind: "hello" }, "me", "", null).kind).toBe("reply");
    expect(handleSyncMessage({ source: "o", kind: "popin", window: "network" }, "me", "", null)).toEqual({ kind: "popin", window: "network" });
    expect(handleSyncMessage({ source: "o", kind: "popout", window: "setup" }, "me", "", null)).toEqual({ kind: "popout", window: "setup" });
    expect(handleSyncMessage({ source: "o", kind: "open", window: "results" }, "me", "", null)).toEqual({ kind: "open", window: "results" });
    expect(handleSyncMessage({ source: "o", kind: "open", window: "nope" }, "me", "", null).kind).toBe("none");
    expect(handleSyncMessage({ source: "o", kind: "jobs" }, "me", "", null).kind).toBe("refresh");
    expect(handleSyncMessage({ source: "me", kind: "jobs" }, "me", "", null).kind).toBe("none");
    expect(shouldBroadcast("a", "a")).toBe(false);
    expect(shouldBroadcast("b", "a")).toBe(true);
  });
});

describe("figure geometry", () => {
  it("scales tubes linearly, clamped, never invisible", () => {
    expect(tubeWidth(15, 30, 30)).toBe(15);
    expect(tubeWidth(60, 30, 30)).toBe(30);
    expect(tubeWidth(0, 30, 30)).toBe(1);
    expect(tubeWidth(NaN, 30, 30)).toBe(1);
  });
  it("places layers by the Hooks et al. fractions and cuts them at the column depth", () => {
    const b = layerBands(1200, 120);
    expect(b.map((x) => x.name)).toEqual(["L1", "L2/3", "L4", "L5", "L6"]);
    expect(b[2].y0).toBeCloseTo(37.2);
    expect(b[4].y1).toBeCloseTo(120);
    const short = layerBands(600, 100);
    expect(short.map((x) => x.name)).toEqual(["L1", "L2/3", "L4", "L5"]);
    expect(short.at(-1)!.y1).toBeCloseTo(100);
  });
  it("maps depth ranges into the column", () => {
    expect(depthSpan([300, 600], 1200, 120)).toEqual({ y0: 30, y1: 60 });
    expect(depthSpan([600, 300], 1200, 120)).toEqual({ y0: 30, y1: 60 });
    expect(depthSpan(null, 1200, 120)).toBeNull();
    expect(depthSpan([1300, 1400], 1200, 120)).toBeNull();
  });
  it("keeps column proportions", () => {
    const b = columnBox(600, 1200, 90, 120);
    expect(b.w / b.h).toBeCloseTo(0.5);
    expect(b.h).toBeLessThanOrEqual(120);
  });
  it("counts cells, branches, trunks", () => {
    expect(rbcCount(0.45, 10)).toBe(5);
    expect(rbcCount(2, 10)).toBe(10);
    expect(branchPositions(3, 0, 100)).toEqual([25, 50, 75]);
    expect(branchPositions(0, 0, 100)).toEqual([]);
    expect(trunkCounts(17.4, 3, 600, 600)).toEqual({ pa: 6, av: 18 });
  });
  it("draws distributions, dilations, CMRO2 shading and saturation", () => {
    const d = normalCurvePath(4, 1, 10, 100, 50, 10);
    expect(d.startsWith("M0.0,")).toBe(true);
    expect(d.split(" ")).toHaveLength(11);
    expect(dilation(1.2, 10, 30)).toEqual({ before: 10, after: 12 });
    expect(dilation(10, 10, 30).after).toBe(30);
    expect(cmro2Fill(1).opacity).toBe(0);
    expect(cmro2Fill(1.2).color).toBe("var(--increase)");
    expect(cmro2Fill(0.8).color).toBe("var(--decrease)");
    expect(cmro2Fill(1.3).opacity).toBeGreaterThan(cmro2Fill(1.1).opacity);
    expect(hillSaturation(38, 38, 2.7)).toBeCloseTo(0.5);
    expect(hillSaturation(0, 38, 2.7)).toBe(0);
  });
  it("maps parameters and groups to figure regions", () => {
    expect(regionOfGroup("column", "Capillary bed")).toBe("capillary");
    expect(regionOfGroup("column", "Offshoots and connections")).toBe("offshoots");
    expect(regionOfGroup("column", "Penetrating vessels")).toBe("penetrating");
    expect(regionOfGroup("column", "Column size")).toBe("size");
    expect(regionOfGroup("column", "Structural adaptation")).toBe("adaptation");
    expect(regionOfGroup("column", "Boundary conditions")).toBe("bc");
    expect(regionOfParam("column", "pa_branches_per_trunk")).toBe("offshoots");
    expect(regionOfParam("column", "pa_density_per_mm2")).toBe("penetrating");
    expect(regionOfParam("column", "adapt_k_m")).toBe("adaptation");
    expect(regionOfParam("column", "mystery", "Capillary bed")).toBe("capillary");
    expect(regionOfParam("oxygen", "cmro2_umol_per_g_min")).toBe("tissue");
    expect(regionOfParam("bold", "te_ms")).toBe("te");
    expect(regionOfParam("blood", "phase_separation")).toBe("phase");
    expect(networkFigure("suarez2021a")).toBe("bifurcation");
    expect(networkFigure("mouse_cortex_synthetic")).toBe("column");
  });
});

describe("results summaries", () => {
  const meso = (inflow: number, speed: number) => ({
    column: { column: { inflow_nl_s: inflow, perfusion_ml_min_100ml: 100 }, regions: { column: { capillary_speed_mean_mm_s: speed } } },
    layer: { column: { inflow_nl_s: inflow }, regions: { L1: { capillary_speed_mean_mm_s: speed, capillary_slow_fraction: 0.1 }, L4: { capillary_speed_mean_mm_s: speed * 2, capillary_slow_fraction: 0.2 } } },
  });
  const field = (inflow: number, speed: number) => ({
    pressure: [], flow: [], hematocrit: [], viscosity: [], diameter: [], iterations: 7, converged: true, mesoscopic: meso(inflow, speed),
  });
  const run = {
    id: "r", spec: spec(), created: "", provenance: {},
    results: { baseline: field(10, 1), dil: field(12, 1.5) },
    summary: { dil: { relative_flow: [], hematocrit_change: [] } },
  };
  it("gives inflow change per condition", () => {
    const rows = conditionRows(run);
    expect(rows.map((r) => r.label)).toEqual(["baseline", "dil"]);
    expect(rows[0].relInflow).toBeNull();
    expect(rows[1].relInflow).toBeCloseTo(1.2);
    expect(rows[1].capSpeed).toBe(1.5);
  });
  it("gives a per-layer table relative to baseline, or null without layers", () => {
    const t = layerRows(run, "dil")!;
    expect(t.columns.map((c) => c.key)).toEqual(["capillary_speed_mean_mm_s", "capillary_slow_fraction"]);
    expect(t.rows.map((r) => r.region)).toEqual(["L1", "L4"]);
    expect(t.rows[1].rel.capillary_speed_mean_mm_s).toBeCloseTo(1.5);
    expect(layerRows(run, "baseline")!.rows[0].rel.capillary_speed_mean_mm_s).toBeNull();
    expect(layerRows({ ...run, results: { baseline: { ...field(1, 1), mesoscopic: undefined } } }, "baseline")).toBeNull();
  });
});
