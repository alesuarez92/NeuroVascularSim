// Display conversions from the engine's SI units.

export const toUm = (m: number) => m * 1e6;
export const toMmHg = (pa: number) => pa / 133.322387415;
export const toNlPerMin = (q: number) => (q / 1e-12) * 60;

export function fmt(x: number | null | undefined, digits = 3): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return x.toExponential(2);
  if (a >= 1000) return x.toFixed(0);
  return x.toPrecision(digits);
}

export const pct = (ratio: number | null | undefined) =>
  ratio === null || ratio === undefined || !Number.isFinite(ratio)
    ? "–"
    : `${ratio >= 1 ? "+" : ""}${((ratio - 1) * 100).toFixed(1)}%`;
