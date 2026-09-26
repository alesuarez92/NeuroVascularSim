// Which part of a schematic figure a parameter (or a parameter group) refers
// to. Groups come from the engine's docs; their names are matched by
// keyword so small renames do not break the figures, and parameters without
// docs are placed by name. Pure, tested.

export type FigureKind = "column" | "bifurcation" | "blood" | "oxygen" | "bold";

type Rule = [RegExp, string];

// Group-name keywords per figure, most specific first.
const GROUP_RULES: Record<FigureKind, Rule[]> = {
  column: [
    [/adapt/i, "adaptation"],
    [/boundary|pressure/i, "bc"],
    [/offshoot|connect|branch/i, "offshoots"],
    [/capillar/i, "capillary"],
    [/penetrat|trunk|arteriol|venul|surface vessel/i, "penetrating"],
    [/size|column|geometry|domain/i, "size"],
  ],
  bifurcation: [
    [/boundary|pressure/i, "bc"],
    [/daughter/i, "daughters"],
    [/feed|parent/i, "feeding"],
  ],
  blood: [
    [/phase|separation|partition/i, "phase"],
    [/viscos|rheolog/i, "viscosity"],
    [/hematocrit|blood/i, "hematocrit"],
    [/numer|solver|converg|iteration/i, "numerics"],
  ],
  oxygen: [
    [/numer|grid|solver|converg/i, "numerics"],
    [/consum|tissue|metabol/i, "tissue"],
    [/transport|diffus|wall/i, "diffusion"],
    [/hemoglobin|haemoglobin|blood|binding|saturation/i, "hemoglobin"],
    [/inlet|arterial/i, "inlet"],
  ],
  bold: [
    [/echo|te\b|acquisition|sequence/i, "te"],
    [/field|scanner|relax/i, "field"],
    [/voxel|slab|geometry/i, "slab"],
    [/deoxy|susceptib|signal|vessel/i, "deoxy"],
  ],
};

// Parameter-name keywords per figure, for parameters without a matching group.
const NAME_RULES: Record<FigureKind, Rule[]> = {
  column: [
    [/adapt/i, "adaptation"],
    [/^p_|boundary|tissue_pressure/i, "bc"],
    [/branch|offshoot|connect|connector|trunk_terminal/i, "offshoots"],
    [/capillar|tortuosity|l4_density/i, "capillary"],
    [/^pa_|^av_/i, "penetrating"],
    [/size|depth_um|seed|crop|voxel|axis|surface/i, "size"],
  ],
  bifurcation: [
    [/^p_/i, "bc"],
    [/daughter/i, "daughters"],
    [/feeding/i, "feeding"],
  ],
  blood: [
    [/phase/i, "phase"],
    [/viscosity|value/i, "viscosity"],
    [/hematocrit/i, "hematocrit"],
    [/tol|iter|relax/i, "numerics"],
  ],
  oxygen: [
    [/inlet/i, "inlet"],
    [/p50|hill|hb_/i, "hemoglobin"],
    [/cmro2|km_|density/i, "tissue"],
    [/alpha|diffusiv|nusselt/i, "diffusion"],
    [/voxel|sample|tol|iter|relax/i, "numerics"],
  ],
  bold: [
    [/te_ms/i, "te"],
    [/field|theta0|r0/i, "field"],
    [/slab/i, "slab"],
    [/epsilon|extravascular/i, "deoxy"],
  ],
};

const match = (rules: Rule[], s: string) => rules.find(([re]) => re.test(s))?.[1] ?? null;

/** The figure region for a parameter group, or null if the figure has none for it. */
export const regionOfGroup = (fig: FigureKind, group: string): string | null => match(GROUP_RULES[fig], group);

/** The region for a parameter: by its name first (most precise), then by its group. */
export function regionOfParam(fig: FigureKind, name: string, group?: string): string | null {
  return match(NAME_RULES[fig], name) ?? (group ? regionOfGroup(fig, group) : null);
}

/** Which figure explains a network plugin. */
export const networkFigure = (network: string): FigureKind => (network === "suarez2021a" ? "bifurcation" : "column");
