import { useState } from "react";
import { JobList } from "./JobList";
import { OxygenPanel } from "./OxygenPanel";
import { conditionRows, layerRows } from "./results";
import type { AppState } from "./state";
import { fmt, pct } from "./units";

/**
 * The opened run: whether every solve converged, per-condition inflow and
 * its change from baseline, a per-layer table from the mesoscopic
 * summaries, and the oxygen / BOLD results. Each condition can be shown
 * on the network.
 */
export function ResultsWindow({ s, onShowNetwork }: { s: AppState; onShowNetwork: () => void }) {
  const run = s.run;
  const [layerOf, setLayerOf] = useState<string | null>(null);
  const [tab, setTab] = useState<"flow" | "oxygen">("flow");
  if (!run) {
    const active = s.jobs.filter((j) => j.status === "queued" || j.status === "running");
    return (
      <div className="pad">
        <p className="muted">No run opened yet. Set up an experiment and press “Run experiment”, or open a past run from “Runs &amp; jobs”.</p>
        {active.length > 0 && <JobList jobs={active} onOpen={(id) => s.openRun(id)} onCancel={s.cancelJob} />}
      </div>
    );
  }
  const rows = conditionRows(run);
  const converged = rows.every((r) => r.converged);
  const conditions = Object.keys(run.summary);
  const label = layerOf && run.results[layerOf] ? layerOf : conditions[0] ?? "baseline";
  const layers = layerRows(run, label);
  const onNetwork = s.shownRun?.id === run.id;
  const show = (l: string) => {
    s.setColorBy(l === "baseline" ? { kind: "type" } : { kind: "relflow", label: l });
    onShowNetwork();
  };
  return (
    <div className="results">
      <div className="results-header">
        <div>
          <strong>{run.spec.name}</strong> <span className="muted">run {run.id} · {run.created.replace("T", " ").replace(/\+00:00$/, " UTC")}</span>
        </div>
        <span className={converged ? "badge ok" : "badge bad"}>{converged ? "✓ converged" : "✗ not converged"}</span>
      </div>
      {!onNetwork && <p className="hint pad-x">The network window shows a different network from this run; open the run's spec from “Runs &amp; jobs” to see it there.</p>}
      <div className="tabs" role="tablist" aria-label="Results">
        <button role="tab" aria-selected={tab === "flow"} className={tab === "flow" ? "tab active" : "tab"} onClick={() => setTab("flow")}>Flow &amp; layers</button>
        <button role="tab" aria-selected={tab === "oxygen"} className={tab === "oxygen" ? "tab active" : "tab"} onClick={() => setTab("oxygen")}>Oxygen &amp; BOLD</button>
      </div>
      {tab === "flow" ? (
        <div className="results-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>Solver</th>
                  <th className="num">Inflow (nL/s)</th>
                  <th className="num">vs baseline</th>
                  <th className="num">Perfusion (mL/min/100 mL)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className={r.converged ? "" : "error"}>{r.converged ? "converged" : "not converged"} · {r.iterations} it.</td>
                    <td className="num">{fmt(r.inflow)}</td>
                    <td className="num">{r.label === "baseline" ? "–" : pct(r.relInflow)}</td>
                    <td className="num">{fmt(r.perfusion)}</td>
                    <td>
                      {onNetwork && (
                        <button type="button" className="ghost small" onClick={() => show(r.label)}>
                          {r.label === "baseline" ? "Show network" : "Show flow change"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {layers ? (
            <div className="layers">
              <label className="inline compact-select">
                Per layer for
                <select value={label} onChange={(e) => setLayerOf(e.target.value)}>
                  {["baseline", ...conditions].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Layer</th>
                      {layers.columns.map((c) => <th key={c.key} className="num">{c.label} ({c.unit})</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {layers.rows.map((r) => (
                      <tr key={r.region}>
                        <td>{r.region}</td>
                        {layers.columns.map((c) => {
                          const v = r.values[c.key];
                          const rel = r.rel[c.key];
                          return (
                            <td key={c.key} className="num">
                              {c.percent ? (v === null ? "–" : (100 * v).toFixed(1)) : fmt(v)}
                              {rel !== null && <span className={`rel ${rel >= 1 ? "up" : "down"}`}> {pct(rel)}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint pad-x">Changes are relative to the baseline in the same layer. Slow capillaries: share below the engine's slow-speed threshold (vascular/summary.py).</p>
            </div>
          ) : (
            <p className="muted pad">No per-layer summaries in this run (the network has no layers, or the run predates them).</p>
          )}
        </div>
      ) : (
        <OxygenPanel run={run} />
      )}
    </div>
  );
}

/** Background jobs and past runs. */
export function RunsWindow({ s }: { s: AppState }) {
  return (
    <div className="pad runs-window">
      <div className="row between">
        <h3 className="groups-title">Jobs</h3>
        <button type="button" className="ghost small" onClick={s.refreshJobs}>Refresh</button>
      </div>
      <JobList jobs={s.jobs} onOpen={(id) => s.openRun(id)} onCancel={s.cancelJob} />
      <h3 className="groups-title">Runs</h3>
      {s.runs.length === 0 ? (
        <p className="muted">No runs yet.</p>
      ) : (
        <ul className="runs">
          {s.runs.map((r) => (
            <li key={r.id}>
              <button className={s.run?.id === r.id ? "run active" : "run"} onClick={() => s.openRun(r.id)}>
                <span>{r.name}</span>
                <span className="muted">{r.created.replace("T", " ").replace("+00:00", " UTC")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
