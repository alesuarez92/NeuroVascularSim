// Network statistics set against published measurements (mouse cortex), so a
// network can be judged at a glance. Sources: see docs/networks.md.

import type { NetworkStats } from "./api";

export type StatRow = {
  label: string;
  value: number | null;
  unit: string;
  target?: { lo: number; hi: number; text: string; source: string };
};

const ratio = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || b === 0 ? null : a / b;

export function statRows(s: NetworkStats): StatRow[] {
  const st = s.statistics;
  const cap = st.capillary;
  const lengthOf = (c?: { length_um: { mean?: number; n?: number } }) =>
    c && c.length_um.n ? c.length_um.mean! * c.length_um.n : 0;
  const totalLength = lengthOf(st.arterial) + lengthOf(cap) + lengthOf(st.venous);
  return [
    { label: "Segments", value: st.n_edges, unit: "" },
    {
      label: "Capillary length density",
      value: cap?.length_density_m_per_mm3 ?? null,
      unit: "m/mm³",
      target: { lo: 0.71, hi: 1.05, text: "0.88 ± 0.17", source: "Ji 2021" },
    },
    {
      label: "Capillary diameter, median",
      value: cap?.diameter_um.n ? cap.diameter_um.median : null,
      unit: "µm",
      target: { lo: 3, hi: 5, text: "4.0 ± 1.0", source: "Schmid 2017" },
    },
    {
      label: "Capillary segment length, median",
      value: cap?.length_um.n ? cap.length_um.median : null,
      unit: "µm",
      target: { lo: 46, hi: 50, text: "46–50", source: "Blinder 2013, Ji 2021" },
    },
    {
      label: "Capillary share of vascular volume",
      value: ratio(cap?.volume_fraction, st.vascular_volume_fraction),
      unit: "",
      target: { lo: 0.6, hi: 1.0, text: "0.8 ± 0.2", source: "Ji 2021" },
    },
    {
      label: "Capillary share of vascular length",
      value: totalLength > 0 && cap?.length_um.n ? lengthOf(cap) / totalLength : null,
      unit: "",
      target: { lo: 0.93, hi: 0.98, text: "0.959", source: "Ji 2021" },
    },
    {
      label: "Capillary branch order, mean",
      value: s.branch_order.mean_order_nearest,
      unit: "",
      target: { lo: 3.2, hi: 3.6, text: "3.4 ± 0.2", source: "Ji 2021" },
    },
    {
      label: "Arteriole-to-venule path, median",
      value: s.branch_order.median_arterial_to_venous_path,
      unit: "branches",
      target: { lo: 6, hi: 8, text: "~7", source: "Ji 2021" },
    },
    {
      label: "Junctions of degree 3",
      value: st.degree_fractions["3"] ?? 0,
      unit: "",
      target: { lo: 0.6, hi: 1.0, text: "predominant", source: "Blinder 2013" },
    },
  ];
}

export type Verdict = "in" | "near" | "out" | "none";

/** In range, within 25% of it, or outside. */
export function verdict(row: StatRow): Verdict {
  if (!row.target || row.value == null || !Number.isFinite(row.value)) return "none";
  const { lo, hi } = row.target;
  if (row.value >= lo && row.value <= hi) return "in";
  const width = Math.max(hi - lo, 0.25 * Math.abs(hi));
  return row.value >= lo - 0.25 * width && row.value <= hi + 0.25 * width ? "near" : "out";
}
