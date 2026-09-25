// Colour encodings for vessels. Values follow the data-viz reference palette
// (light surface #fcfcfb); the categorical trio was validated for normal and
// colour-blind vision (all pairs), so arterial / capillary / venous stay
// distinguishable. Identity is never colour-alone: the legend, tooltip and
// edge table carry the same information.

export type VesselClass = "arterial" | "capillary" | "venous";

export const CLASS_COLORS: Record<VesselClass, string> = {
  arterial: "#e34948",
  capillary: "#4a3aa7",
  venous: "#2a78d6",
};

export const CLASS_LABELS: Record<VesselClass, string> = {
  arterial: "Arterial",
  capillary: "Capillary",
  venous: "Venous",
};

const CLASS_OF: Record<string, VesselClass> = {
  PIAL_ARTERY: "arterial",
  PENETRATING_ARTERIOLE: "arterial",
  PRECAPILLARY_ARTERIOLE: "arterial",
  ARTERIOLE: "arterial",
  CAPILLARY: "capillary",
  VENULE: "venous",
  ASCENDING_VENULE: "venous",
  PIAL_VEIN: "venous",
};

export function vesselClass(type: string): VesselClass {
  const c = CLASS_OF[type];
  if (!c) throw new Error(`unknown vessel type ${type}`);
  return c;
}

// Diverging (decrease ← neutral → increase): blue and red poles, gray midpoint.
// The midpoint is a mid gray rather than the near-surface gray so unchanged
// vessels stay visible on the light surface.
export const DIVERGING = { low: "#1c5cab", mid: "#a8a7a1", high: "#b8322f" };

// Sequential blue, from the reference ramp (step 250 → 700; the lightest steps
// are skipped so thin vessels stay visible).
export const SEQUENTIAL = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as [number, number, number]);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Colour for a signed value in [-limit, limit] (e.g. a percent change). */
export function diverging(value: number, limit: number): string {
  if (!Number.isFinite(value) || limit <= 0) return DIVERGING.mid;
  const t = clamp(value / limit, -1, 1);
  return t < 0 ? mix(DIVERGING.mid, DIVERGING.low, -t) : mix(DIVERGING.mid, DIVERGING.high, t);
}

/** Colour for a magnitude, normalised to [0, 1]. */
export function sequential(t: number): string {
  if (!Number.isFinite(t)) return SEQUENTIAL[0];
  const x = clamp(t, 0, 1) * (SEQUENTIAL.length - 1);
  const i = Math.min(Math.floor(x), SEQUENTIAL.length - 2);
  return mix(SEQUENTIAL[i], SEQUENTIAL[i + 1], x - i);
}

/** A symmetric, readable limit for diverging scales (at least 1%). */
export function symmetricLimit(values: number[]): number {
  // Round first so floating-point noise (10.000000000000009) keeps its round limit.
  const m = Math.round(Math.max(...values.filter(Number.isFinite).map(Math.abs), 0) * 1e6) / 1e6;
  if (m <= 1) return 1;
  const nice = [2, 5, 10, 15, 20, 25, 50, 100, 200, 500];
  return nice.find((n) => n >= m) ?? m;
}
