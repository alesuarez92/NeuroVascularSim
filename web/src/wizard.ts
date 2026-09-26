// The setup wizard's logic: which parameters each step shows, grouped and
// labelled from the engine's parameter docs (with a fallback for anything
// undocumented), what differs from the defaults, presets for common
// conditions, and checks before a run. Pure functions, tested without a
// browser.

import type { Condition, ExperimentSpec, ParamDoc, ParamDocs, Plugins } from "./api";
import { paramLabel } from "./params";

export const OTHER_GROUP = "Other";

export type Field = {
  name: string;
  def: unknown;
  choices?: unknown[];
  doc: ParamDoc;
  documented: boolean;
};
export type FieldGroup = { group: string; fields: Field[] };

/** A parameter's docs, or a fallback: its name as label, under "Other", advanced. */
export function resolveDoc(name: string, docs?: ParamDocs): { doc: ParamDoc; documented: boolean } {
  const d = docs?.params?.[name];
  if (d) {
    return {
      doc: {
        label: d.label || paramLabel(name),
        help: d.help ?? "",
        unit: d.unit ?? "",
        group: d.group || OTHER_GROUP,
        level: d.level === "advanced" ? "advanced" : "basic",
        source: d.source ?? "",
      },
      documented: true,
    };
  }
  return { doc: { label: paramLabel(name), help: "", unit: "", group: OTHER_GROUP, level: "advanced", source: "" }, documented: false };
}

/**
 * Parameters grouped as the docs order them: documented groups first in the
 * docs' order, then groups the docs did not list, "Other" last.
 */
export function groupFields(
  defaults: Record<string, unknown>,
  docs?: ParamDocs,
  choices?: Record<string, unknown[]>,
  include: (name: string, doc: ParamDoc) => boolean = () => true,
): FieldGroup[] {
  const groups = new Map<string, Field[]>();
  for (const [name, def] of Object.entries(defaults)) {
    const { doc, documented } = resolveDoc(name, docs);
    if (!include(name, doc)) continue;
    const list = groups.get(doc.group) ?? [];
    list.push({ name, def, choices: choices?.[name], doc, documented });
    groups.set(doc.group, list);
  }
  const order = [...(docs?.groups ?? [])];
  for (const g of groups.keys()) if (!order.includes(g) && g !== OTHER_GROUP) order.push(g);
  order.push(OTHER_GROUP);
  return order.filter((g) => groups.has(g)).map((g) => ({ group: g, fields: groups.get(g)! }));
}

/** Only basic fields unless advanced ones are asked for; empty groups are dropped. */
export function filterLevel(groups: FieldGroup[], showAdvanced: boolean): FieldGroup[] {
  if (showAdvanced) return groups;
  return groups
    .map((g) => ({ ...g, fields: g.fields.filter((f) => f.doc.level === "basic") }))
    .filter((g) => g.fields.length > 0);
}

export const countAdvanced = (groups: FieldGroup[]) =>
  groups.reduce((n, g) => n + g.fields.filter((f) => f.doc.level === "advanced").length, 0);

/** Whether a value differs from its default ("not set" counts as the default). */
export function isChanged(value: unknown, def: unknown): boolean {
  if (value === undefined) return false;
  const norm = (v: unknown) => (Array.isArray(v) && v.length === 0 ? null : v ?? null);
  return JSON.stringify(norm(value)) !== JSON.stringify(norm(def));
}

export type TextPart = { text: string; href?: string };

/** Split text into plain parts and links: "doi:10.x/..." to https://doi.org/..., and http(s) URLs. */
export function linkify(text: string): TextPart[] {
  const re = /\bdoi:\s?(10\.\d{4,9}\/[^\s,;]+)|\bhttps?:\/\/[^\s,;]+/gi;
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    let raw = m[0];
    // Trailing punctuation belongs to the sentence, not the link (a balanced ")" stays).
    const count = (c: string) => raw.split(c).length - 1;
    while (/[.)\]]$/.test(raw)) {
      if (raw.endsWith(")") && count("(") >= count(")")) break;
      raw = raw.slice(0, -1);
    }
    const start = m.index!;
    if (start > last) out.push({ text: text.slice(last, start) });
    const doi = raw.match(/^doi:\s?(.*)$/i);
    out.push({ text: raw, href: doi ? `https://doi.org/${doi[1]}` : raw });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

// ---- Which wizard step a network parameter belongs to ----------------------

export type NetStep = "network" | "blood" | "bc";

const BC_NAMES = new Set(["p_in_mmhg", "p_out_mmhg", "p_arterial_mmhg", "p_venous_mmhg", "boundary", "tissue_pressure_mmhg"]);

/** Hematocrit goes with blood and flow, pressures and the boundary mode with boundary conditions. */
export function networkStep(name: string, doc?: ParamDoc): NetStep {
  if (BC_NAMES.has(name) || /boundary/i.test(doc?.group ?? "")) return "bc";
  if (name === "hematocrit" || /^blood/i.test(doc?.group ?? "")) return "blood";
  return "network";
}

// ---- Solver ----------------------------------------------------------------

/** Solver options beyond the rheology choices, with the defaults of vascular/flow.py solve_flow. */
export const SOLVER_NUMBERS: Record<string, number> = { tol: 1e-3, max_iter: 500, relaxation: 0.5 };

// ---- Cortical layers -----------------------------------------------------

/**
 * Layers of mouse vibrissal S1 as the engine labels them (vascular/cortex.py):
 * index 1..5, bounds in um. Fractions of cortical depth from Hooks et al.
 * 2011, PLoS Biol 9:e1000572, doi:10.1371/journal.pbio.1000572 (Table 1),
 * scaled to a 1200 um column.
 */
export const LAYERS = [
  { index: 1, name: "L1", top: 0, bottom: 108 },
  { index: 2, name: "L2/3", top: 108, bottom: 372 },
  { index: 3, name: "L4", top: 372, bottom: 552 },
  { index: 4, name: "L5", top: 552, bottom: 888 },
  { index: 5, name: "L6", top: 888, bottom: 1200 },
] as const;
export const LAYER_SOURCE = "Hooks et al. 2011, PLoS Biol 9:e1000572, doi:10.1371/journal.pbio.1000572";

export const VESSEL_TYPES = [
  "PIAL_ARTERY",
  "PENETRATING_ARTERIOLE",
  "PRECAPILLARY_ARTERIOLE",
  "ARTERIOLE",
  "CAPILLARY",
  "VENULE",
  "ASCENDING_VENULE",
  "PIAL_VEIN",
] as const;

// ---- Condition presets -------------------------------------------------------

export type PresetContext = { selected: number | null; existing: string[]; network: string };
export type Preset = {
  id: string;
  label: string;
  description: string;
  needs?: "oxygen" | "selection" | "layers";
  build: (ctx: PresetContext) => Condition;
};

/** A label not yet used by another condition: "x", then "x_2", "x_3", ... */
export function uniqueLabel(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export const PRESETS: Preset[] = [
  {
    id: "arteriolar_dilation",
    label: "Arteriolar dilation 20%",
    description: "Penetrating and precapillary arterioles 20% wider, as in functional hyperaemia. Illustrative size, not from a paper.",
    needs: "layers",
    build: (ctx) => ({
      label: uniqueLabel("arteriolar_dilation_20pct", ctx.existing),
      perturbations: [
        { name: "scale_diameter", params: { vessel_types: ["PENETRATING_ARTERIOLE", "PRECAPILLARY_ARTERIOLE"], factor: 1.2 } },
      ],
    }),
  },
  {
    id: "precapillary_constriction",
    label: "Precapillary constriction 12%",
    description:
      "Precapillary arterioles 12% narrower: optogenetic constriction of smooth-muscle-covered vessels under 10 µm " +
      "was 11.8 ± 2.1%, with none in pericyte-covered capillaries (Hill et al. 2015, Neuron 87:95, doi:10.1016/j.neuron.2015.06.001).",
    needs: "layers",
    build: (ctx) => ({
      label: uniqueLabel("precapillary_constriction_12pct", ctx.existing),
      perturbations: [{ name: "scale_diameter", params: { vessel_types: ["PRECAPILLARY_ARTERIOLE"], factor: 0.88 } }],
    }),
  },
  {
    id: "cmro2_l4",
    label: "CMRO2 +10% in L4",
    description: "Oxygen consumption 10% higher in layer 4 only, vessels unchanged. Illustrative size, not from a paper.",
    needs: "oxygen",
    build: (ctx) => ({
      label: uniqueLabel("cmro2_plus10pct_L4", ctx.existing),
      perturbations: [{ name: "scale_cmro2", params: { factor: 1.1, layers: [3], depth_range_um: null } }],
    }),
  },
  {
    id: "dilate_selected",
    label: "Dilate the selected vessel",
    description: "The vessel picked in the network window, 30% wider. Illustrative size, not from a paper.",
    needs: "selection",
    build: (ctx) => ({
      label: uniqueLabel(ctx.selected === null ? "dilate_vessel" : `dilate_vessel_${ctx.selected}`, ctx.existing),
      perturbations: [{ name: "scale_diameter", params: { edges: ctx.selected === null ? [] : [ctx.selected], factor: 1.3 } }],
    }),
  },
  {
    id: "dilate_active",
    label: "Dilate the active daughter 30%",
    description: "Suarez et al. 2021 bifurcation: one daughter arteriole 30% wider.",
    build: (ctx) => ({
      label: uniqueLabel("dilate_active_30pct", ctx.existing),
      perturbations: [{ name: "scale_diameter", params: { edges: ["active_edge"], factor: 1.3 } }],
    }),
  },
];

/** Presets that make sense for this network and settings, with why others are unavailable. */
export function presetAvailability(p: Preset, ctx: { hasLayers: boolean; oxygen: boolean; selected: number | null; network: string }): string | null {
  if (p.id === "dilate_active") return ctx.network === "suarez2021a" ? null : "only for the suarez2021a network";
  if (p.needs === "layers" && !ctx.hasLayers) return "needs a network with vessel classes by depth";
  if (p.needs === "oxygen" && !ctx.oxygen) return "turn on oxygen (step 4) first";
  if (p.needs === "selection" && ctx.selected === null) return "click a vessel in the network window first";
  return null;
}

// ---- Validation ------------------------------------------------------------

export type Issue = { level: "error" | "warning"; message: string };

/** Problems the engine would refuse, or settings that probably are not what was meant. */
export function checkSpec(spec: ExperimentSpec): Issue[] {
  const issues: Issue[] = [];
  if (!spec.network.name) issues.push({ level: "error", message: "Choose a network." });
  const labels = spec.conditions.map((c) => c.label.trim());
  labels.forEach((l, i) => {
    if (!l) issues.push({ level: "error", message: `Condition ${i + 1} has no label.` });
    else if (l === "baseline") issues.push({ level: "error", message: `“baseline” is reserved for the unperturbed network.` });
    else if (labels.indexOf(l) !== i) issues.push({ level: "error", message: `Two conditions are called “${l}”.` });
  });
  spec.conditions.forEach((c) => {
    const name = c.label || "(unnamed)";
    if (!c.perturbations.length) issues.push({ level: "warning", message: `${name}: no perturbation, it will equal the baseline.` });
    for (const p of c.perturbations) {
      const q = p.params as Record<string, unknown>;
      const factor = Number(q.factor ?? (p.name === "scale_cmro2" ? 1.2 : 1.3));
      if (!(factor > 0)) issues.push({ level: "error", message: `${name}: the ${p.name} factor must be above 0.` });
      if (p.name === "scale_diameter") {
        const any = [q.edges, q.vessel_types, q.layers].some((v) => Array.isArray(v) && v.length) || q.depth_range_um != null;
        if (!any) issues.push({ level: "error", message: `${name}: choose which vessels to scale (vessel type, layers, depth or edges).` });
      }
      if (p.name === "scale_cmro2" && spec.oxygen == null) {
        issues.push({ level: "error", message: `${name}: a CMRO2 change needs the oxygen model (step 4).` });
      }
      const r = q.depth_range_um;
      if (Array.isArray(r) && (r.length !== 2 || !(Number(r[0]) < Number(r[1])))) {
        issues.push({ level: "error", message: `${name}: the depth range must be “from, to” with from < to.` });
      }
    }
  });
  if (spec.bold != null && spec.oxygen == null) issues.push({ level: "error", message: "BOLD needs the oxygen model." });
  return issues;
}

// ---- Review: what differs from the defaults ----------------------------------

export type Change = { section: string; name: string; label: string; value: unknown; def: unknown; unit: string };

/** Every setting that differs from its default, labelled from the docs. */
export function changedSettings(
  spec: ExperimentSpec,
  plugins: Plugins,
  docs: Record<string, ParamDocs>,
  models: Record<"oxygen" | "bold", Record<string, unknown>> | null,
  solverDefaults: Record<string, unknown>,
): Change[] {
  const out: Change[] = [];
  const add = (section: string, scope: string, values: Record<string, unknown>, defaults: Record<string, unknown>, pluginDocs?: ParamDocs) => {
    for (const [name, def] of Object.entries(defaults)) {
      if (!isChanged(values[name], def)) continue;
      const { doc } = resolveDoc(name, pluginDocs ?? docs[scope]);
      out.push({ section, name, label: doc.label, value: values[name], def, unit: doc.unit });
    }
  };
  const net = plugins.network?.plugins.find((p) => p.name === spec.network.name);
  if (net) add("Network", `network/${net.name}`, spec.network.params, net.parameters, net.docs);
  add("Solver", "model/solver", spec.solver, { ...SOLVER_NUMBERS, ...solverDefaults });
  if (models && spec.oxygen) add("Oxygen", "model/oxygen", spec.oxygen, models.oxygen);
  if (models && spec.bold) add("BOLD", "model/bold", spec.bold, models.bold);
  return out;
}

/** A value as the review shows it. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "not set";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "string") return v.replace(/_/g, " ");
  return String(v);
}

/** First sentence of a help text, for a one-line tooltip. */
export function firstSentence(text: string): string {
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : text).trim();
}

// ---- Plain-language descriptions ---------------------------------------------

const typeName = (t: string) => t.toLowerCase().replace(/_/g, " ");
const layerName = (i: number) => LAYERS.find((l) => l.index === i)?.name ?? `layer ${i}`;
const pctChange = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 1000) / 10}%`;

/** "Diameter +20% (×1.2) of penetrating arterioles in L4, 400–550 µm deep" and the like. */
export function describePerturbation(p: { name: string; params: Record<string, unknown> }): string {
  const q = p.params;
  const f = Number(q.factor ?? (p.name === "scale_cmro2" ? 1.2 : 1.3));
  const where: string[] = [];
  const layers = Array.isArray(q.layers) ? (q.layers as number[]) : [];
  const range = Array.isArray(q.depth_range_um) ? (q.depth_range_um as number[]) : null;
  if (layers.length) where.push(`in ${layers.map(layerName).join(", ")}`);
  if (range?.length === 2) where.push(`${range[0]}–${range[1]} µm deep`);
  if (p.name === "scale_cmro2") {
    return `Oxygen consumption ${pctChange(f)} (×${f}) ${where.length ? where.join(", ") : "everywhere"}`;
  }
  if (p.name === "scale_diameter") {
    const what: string[] = [];
    const types = Array.isArray(q.vessel_types) ? (q.vessel_types as string[]) : [];
    const edges = Array.isArray(q.edges) ? (q.edges as unknown[]) : [];
    if (types.length) what.push(types.map((t) => `${typeName(t)}s`).join(", "));
    if (edges.length) what.push(`vessel${edges.length > 1 ? "s" : ""} ${edges.map((e) => String(e).replace(/_/g, " ")).join(", ")}`);
    if (!what.length) what.push(where.length ? "all vessels" : "no vessels (choose some)");
    return `Diameter ${pctChange(f)} (×${f}) of ${what.join(" and ")}${where.length ? " " + where.join(", ") : ""}`;
  }
  return `${p.name} ${JSON.stringify(q)}`;
}

/** Toggle a value in a list (keeps order of first insertion). */
export const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
