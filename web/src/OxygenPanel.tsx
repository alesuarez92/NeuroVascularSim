import { useState } from "react";
import type { RunRecord } from "./api";
import { ProfileChart, type Series } from "./ProfileChart";
import { SliceMap } from "./SliceMap";
import { fmt } from "./units";

// Categorical slots in fixed order (validated palette); the baseline is a neutral dashed reference.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const BASELINE = "#52514e";

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "–" : `${(100 * x).toFixed(d)}%`);

/** Oxygen and BOLD results of a run: summary per condition, laminar profiles, tissue map. */
export function OxygenPanel({ run }: { run: RunRecord }) {
  const labels = Object.keys(run.results);
  const conditions = Object.keys(run.summary).slice(0, SERIES_COLORS.length);
  const [sliceOf, setSliceOf] = useState("baseline");
  const color = (label: string) => (label === "baseline" ? BASELINE : SERIES_COLORS[conditions.indexOf(label)]);

  if (!run.results.baseline?.oxygen) {
    return <p className="muted pad">This run has no oxygen results. Tick “Simulate oxygen” in the experiment and run it again.</p>;
  }
  const base = run.results.baseline.oxygen!;
  const tissueSeries: Series[] = labels
    .filter((l) => run.results[l].oxygen?.depth_profile)
    .map((l) => ({
      label: l,
      color: color(l),
      dashed: l === "baseline",
      values: run.results[l].oxygen!.depth_profile!.tissue_po2_mean,
    }));
  const boldSeries: Series[] = conditions
    .filter((l) => run.summary[l].bold)
    .map((l) => ({ label: l, color: color(l), values: run.summary[l].bold!.signal_change_pct }));
  const bold0 = conditions.map((l) => run.summary[l].bold).find(Boolean);
  const slice = run.results[sliceOf]?.tissue_slice;

  return (
    <div className="oxygen-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Condition</th>
              <th className="num">OEF</th>
              <th className="num">Extracted by arterioles</th>
              <th className="num">CMRO₂ (µmol/g/min)</th>
              <th className="num">Tissue PO₂ mean / p10 (mmHg)</th>
              <th className="num">Hypoxic tissue (&lt;10 mmHg)</th>
              <th className="num">BOLD, column</th>
              <th className="num">O2 balance</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((l) => {
              const o = run.results[l].oxygen;
              const b = run.summary[l]?.bold;
              return (
                <tr key={l}>
                  <td>{l}</td>
                  <td className="num">{pct(o?.oef)}</td>
                  <td className="num">{pct(o?.arteriolar_extraction_fraction, 0)}</td>
                  <td className="num">{fmt(o?.cmro2_umol_per_g_min)}</td>
                  <td className="num">{o ? `${o.tissue_po2_mean.toFixed(1)} / ${o.tissue_po2_p10.toFixed(1)}` : "–"}</td>
                  <td className="num">{pct(o?.hypoxic_fraction, 0)}</td>
                  <td className="num">{b ? `${b.column_signal_change_pct >= 0 ? "+" : ""}${b.column_signal_change_pct.toFixed(2)}%` : "–"}</td>
                  <td className="num" title="oxygen delivered by blood / consumed by tissue">{fmt(o?.o2_balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint pad">
          Measured in mouse cortex (Sakadžić et al. 2014): OEF 35%, about half extracted by arterioles. Baseline here:
          OEF {pct(base.oef)}, {pct(base.arteriolar_extraction_fraction, 0)} by arterioles; see docs/oxygen.md.
        </p>
      </div>
      <div className="charts">
        {tissueSeries.length > 0 && (
          <ProfileChart title="Tissue PO₂ by depth" unit="mmHg" depth={tissueSeries[0] ? run.results.baseline.oxygen!.depth_profile!.depth_um : []} series={tissueSeries} />
        )}
        {bold0 && boldSeries.length > 0 && (
          <ProfileChart
            title={`BOLD signal change by depth (${bold0.params.field_t} T, TE ${bold0.params.te_ms} ms)`}
            unit="%"
            depth={bold0.depth_um}
            series={boldSeries}
            zeroLine
          />
        )}
        {slice && (
          <div>
            <label className="inline compact-select">
              Map of
              <select value={sliceOf} onChange={(e) => setSliceOf(e.target.value)}>
                {labels.filter((l) => run.results[l].tissue_slice).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <SliceMap slice={slice} />
          </div>
        )}
      </div>
    </div>
  );
}
