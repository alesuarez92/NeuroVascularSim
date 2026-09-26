// A condition as the form edits it: a diameter change and, optionally, a
// change of tissue oxygen consumption over the same layers / depth range.

import type { Component, Condition } from "./api";

export type DiameterParams = {
  edges?: (string | number)[];
  vessel_types?: string[];
  layers?: number[];
  depth_range_um?: number[] | null;
  factor?: number;
};

export function conditionParts(c: Condition): { diameter: DiameterParams; cmro2: number | null; other: Component[] } {
  const d = c.perturbations.find((p) => p.name === "scale_diameter");
  const m = c.perturbations.find((p) => p.name === "scale_cmro2");
  const other = c.perturbations.filter((p) => p.name !== "scale_diameter" && p.name !== "scale_cmro2");
  return {
    diameter: (d?.params ?? {}) as DiameterParams,
    cmro2: m ? Number((m.params as { factor?: number }).factor ?? 1) : null,
    other,
  };
}

/** Perturbations for a condition: the diameter change, then the CMRO₂ change on the same region. */
export function buildCondition(c: Condition, diameter: DiameterParams, cmro2: number | null): Condition {
  const { other } = conditionParts(c);
  const perturbations: Component[] = [{ name: "scale_diameter", params: { ...diameter } }];
  if (cmro2 !== null) {
    perturbations.push({
      name: "scale_cmro2",
      params: { factor: cmro2, layers: diameter.layers ?? [], depth_range_um: diameter.depth_range_um ?? null },
    });
  }
  return { ...c, perturbations: [...perturbations, ...other] };
}
