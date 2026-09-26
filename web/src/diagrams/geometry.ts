// Value -> geometry for the schematic figures: how wide a tube is drawn for a
// diameter, where layers and depth ranges fall in a drawn column, how many
// red cells fill a vessel for a hematocrit... Pure functions, tested without
// a browser. Figures are schematic: scales are linear and clamped so that
// any value gives a readable drawing.

import { LAYERS } from "../wizard";

export const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const finite = (x: unknown, fb: number) => (typeof x === "number" && Number.isFinite(x) ? x : fb);

/** Linear map of v from [a0, a1] to [b0, b1], clamped to the output range. */
export function scale(v: number, a0: number, a1: number, b0: number, b1: number): number {
  if (a1 === a0) return b0;
  const t = clamp((v - a0) / (a1 - a0), 0, 1);
  return b0 + t * (b1 - b0);
}

/** Drawn width (px) of a vessel of diameter d um, on a 0..maxUm scale, never thinner than 1 px. */
export const tubeWidth = (dUm: number, maxUm: number, maxPx: number) =>
  Math.max(1, scale(finite(dUm, 0), 0, maxUm, 0, maxPx));

/** A layer band in a drawn column: y from the top (px) for a column `depthUm` deep drawn `heightPx` tall. */
export type Band = { index: number; name: string; y0: number; y1: number; top: number; bottom: number };

/** Layer bands of a column; layers below the column's depth are cut off or dropped. */
export function layerBands(depthUm: number, heightPx: number, y0 = 0): Band[] {
  const depth = Math.max(finite(depthUm, 1200), 1);
  return LAYERS.filter((l) => l.top < depth).map((l) => ({
    index: l.index,
    name: l.name,
    top: l.top,
    bottom: Math.min(l.bottom, depth),
    y0: y0 + (l.top / depth) * heightPx,
    y1: y0 + (Math.min(l.bottom, depth) / depth) * heightPx,
  }));
}

/** A depth range (um) as y (px) in a drawn column, clipped to the column; null if outside or unset. */
export function depthSpan(range: unknown, depthUm: number, heightPx: number, y0 = 0): { y0: number; y1: number } | null {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const depth = Math.max(finite(depthUm, 1200), 1);
  const a = clamp(Math.min(Number(range[0]), Number(range[1])), 0, depth);
  const b = clamp(Math.max(Number(range[0]), Number(range[1])), 0, depth);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return { y0: y0 + (a / depth) * heightPx, y1: y0 + (b / depth) * heightPx };
}

/** The column box (px) for a column size, keeping its proportions inside maxW x maxH. */
export function columnBox(sizeXUm: number, depthUm: number, maxW: number, maxH: number): { w: number; h: number } {
  const sx = Math.max(finite(sizeXUm, 1), 1);
  const d = Math.max(finite(depthUm, 1200), 1);
  const k = Math.min(maxW / sx, maxH / d);
  return { w: Math.max(sx * k, 4), h: Math.max(d * k, 4) };
}

/** Red cells drawn in a vessel with room for `capacity` cells, for a hematocrit (0..1). */
export const rbcCount = (hematocrit: number, capacity: number) =>
  Math.round(clamp(finite(hematocrit, 0), 0, 1) * capacity);

/** Evenly spaced positions of n side branches along a trunk from a to b (not at the ends). */
export function branchPositions(n: number, a: number, b: number): number[] {
  const k = Math.max(0, Math.min(Math.round(finite(n, 0)), 12));
  return Array.from({ length: k }, (_, i) => a + ((i + 1) * (b - a)) / (k + 1));
}

/**
 * A normal density curve as SVG path data, over mean +- 4 sd clipped at 0
 * (diameters are positive), in a w x h box; the x-axis spans 0..xMax.
 */
export function normalCurvePath(mean: number, sd: number, xMax: number, w: number, h: number, n = 48): string {
  const m = finite(mean, 0);
  const s = Math.max(finite(sd, 0), xMax / 200);
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * xMax;
    pts.push([x, Math.exp(-0.5 * ((x - m) / s) ** 2)]);
  }
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${((x / xMax) * w).toFixed(1)},${(h - y * h).toFixed(1)}`).join(" ");
}

/** x (px) of a pressure on a gauge from 0 to maxMmHg that is `w` px wide. */
export const gaugeX = (mmHg: number, maxMmHg: number, w: number) => scale(finite(mmHg, 0), 0, maxMmHg, 0, w);

/** Before/after widths of a vessel scaled by `factor` (drawn width clamped to [1, maxPx]). */
export function dilation(factor: number, basePx: number, maxPx: number): { before: number; after: number } {
  const f = Math.max(finite(factor, 1), 0);
  return { before: basePx, after: clamp(basePx * f, 1, maxPx) };
}

/**
 * Fill for a layer whose oxygen consumption is multiplied by `factor`:
 * warmer and stronger for an increase, cooler for a decrease, none at 1.
 */
export function cmro2Fill(factor: number): { color: string; opacity: number } {
  const f = finite(factor, 1);
  if (Math.abs(f - 1) < 1e-9) return { color: "none", opacity: 0 };
  return { color: f > 1 ? "var(--increase)" : "var(--decrease)", opacity: clamp(0.15 + Math.abs(f - 1) * 1.7, 0.15, 0.85) };
}

/** Oxygen saturation of hemoglobin for a PO₂ (Hill equation; p50 and n are the oxygen model's values, passed in). */
export function hillSaturation(po2: number, p50: number, n: number): number {
  const p = Math.max(finite(po2, 0), 0);
  const a = p ** n;
  return a / (a + Math.max(p50, 1e-6) ** n);
}

/** Number of penetrating arterioles and venules in a column of size x by y um. */
export function trunkCounts(densityPerMm2: number, avToPa: number, sxUm: number, syUm: number): { pa: number; av: number } {
  const area = Math.max(finite(sxUm, 0), 0) * Math.max(finite(syUm, 0), 0) * 1e-6;
  const pa = Math.max(1, Math.round(Math.max(finite(densityPerMm2, 0), 0) * area));
  return { pa: Math.min(pa, 60), av: Math.min(Math.max(1, Math.round(pa * Math.max(finite(avToPa, 0), 0))), 120) };
}

/** Deterministic scatter of n points in a w x h box (a lattice with jitter), for schematic dots. */
export function scatter(n: number, w: number, h: number, seed = 1): [number, number][] {
  const k = Math.max(0, Math.round(n));
  const cols = Math.max(1, Math.ceil(Math.sqrt((k * w) / Math.max(h, 1))));
  const rows = Math.max(1, Math.ceil(k / cols));
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push([((c + 0.25 + 0.5 * rnd()) / cols) * w, ((r + 0.25 + 0.5 * rnd()) / rows) * h]);
  }
  return out;
}
