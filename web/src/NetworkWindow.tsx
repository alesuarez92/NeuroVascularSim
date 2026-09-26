import { Suspense, lazy, useState } from "react";
import { SEGMENT_LABELS } from "./colors";
import { EdgeTable } from "./EdgeTable";
import { Legend } from "./Legend";
import { SelectionCard } from "./SelectionCard";
import type { AppState } from "./state";
import { StatsPanel } from "./StatsPanel";
import { fmt, pct, toNlPerMin, toUm } from "./units";
import { ViewControls } from "./ViewControls";
import { colorByKey } from "./viz";

// The 3D viewer (three.js) is the largest part of the app: load it as its own
// chunk so the page and the forms appear before it has downloaded.
const NetworkView = lazy(() => import("./NetworkView").then((m) => ({ default: m.NetworkView })));

/**
 * The network: colour and view controls, the 3D stage (legend, selected
 * vessel, hover details) and, below it, the vessel table or the network
 * statistics. The 3D view follows the window's size; in a short window the
 * table gives way so the stage keeps the height (see styles.css).
 */
export function NetworkWindow({ s }: { s: AppState }) {
  const [tab, setTab] = useState<"vessels" | "stats" | "none">("vessels");
  const { network, spec, view, drawnGraph: g, shownRun, hover } = s;
  return (
    <div className="network-shell">
      <div className={`network-window${tab === "none" ? " no-bottom" : ""}`}>
        <div className="toolbar net-toolbar">
          <label className="inline color-by">
            <span>Colour by</span>
            <select
              value={colorByKey(s.colorBy)}
              onChange={(e) => s.setColorBy(s.colorOptions.find((o) => colorByKey(o.value) === e.target.value)!.value)}
            >
              {s.colorOptions.map((o) => (
                <option key={colorByKey(o.value)} value={colorByKey(o.value)}>{o.label}</option>
              ))}
            </select>
          </label>
          {network && <ViewControls graph={network.graph} view={s.viewSettings} onChange={s.setViewSettings} />}
          {shownRun && (
            <span className="muted run-status" title={`Run ${shownRun.id}`}>
              run {shownRun.id} · {Object.values(shownRun.results).every((f) => f.converged) ? "converged" : "NOT converged"}
            </span>
          )}
        </div>

        <div className="stage">
          {g && view ? (
            <>
              <Suspense fallback={<p className="muted center">Loading the 3D viewer…</p>}>
                <NetworkView
                  graph={g}
                  colors={view.colors}
                  highlight={s.highlighted}
                  fade={hover || s.rowHover !== null ? 0.55 : 0.3}
                  visible={s.visible}
                  widthScale={s.viewSettings.widthScale}
                  onHover={(edge, x, y) => s.setHover(edge === null ? null : { edge, x, y })}
                  onPick={s.setSelected}
                />
              </Suspense>
              <Legend legend={view.legend} />
              {s.selected !== null && s.selected < g.n_edges && spec && (
                <SelectionCard
                  edge={s.selected}
                  graph={g}
                  run={shownRun}
                  conditions={spec.conditions}
                  onAddToCondition={s.addSelectedTo}
                  onClose={() => s.setSelected(null)}
                />
              )}
              {hover && (
                <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
                  <strong>Vessel {hover.edge}</strong> · {SEGMENT_LABELS[g.vessel_type[hover.edge]] ?? g.vessel_type[hover.edge]}
                  <div>D {fmt(toUm(g.diameter[hover.edge]))} µm · L {fmt(toUm(g.length[hover.edge]))} µm</div>
                  {shownRun && (
                    <>
                      <div>Flow {fmt(toNlPerMin(shownRun.results.baseline.flow[hover.edge]))} nL/min · Hct {fmt(shownRun.results.baseline.hematocrit[hover.edge])}</div>
                      {shownRun.results.baseline.po2 && (
                        <div>PO₂ {fmt(shownRun.results.baseline.po2[hover.edge])} mmHg · SO₂ {fmt(100 * (shownRun.results.baseline.so2?.[hover.edge] ?? NaN))}%</div>
                      )}
                      {Object.entries(shownRun.summary).map(([label, sm]) => (
                        <div key={label}>{label}: {pct(sm.relative_flow[hover.edge])}</div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="muted center">Loading network…</p>
          )}
        </div>

        <section className="bottom">
          <div className="tabs" role="tablist" aria-label="Network details">
            <button role="tab" aria-selected={tab === "vessels"} className={tab === "vessels" ? "tab active" : "tab"} onClick={() => setTab("vessels")}>Vessels</button>
            <button role="tab" aria-selected={tab === "stats"} className={tab === "stats" ? "tab active" : "tab"} onClick={() => setTab("stats")}>Statistics</button>
            <button className="tab tab-right" aria-label={tab === "none" ? "Show the table" : "Hide the table"} onClick={() => setTab(tab === "none" ? "vessels" : "none")}>
              {tab === "none" ? "▴ Show" : "▾ Hide"}
            </button>
          </div>
          {tab === "vessels" && network && (
            <EdgeTable graph={network.graph} run={shownRun} selected={s.highlighted} onHover={s.setRowHover} onSelect={s.setSelected} />
          )}
          {tab === "stats" && spec && <div className="pad scroll"><StatsPanel network={spec.network} /></div>}
        </section>
      </div>
    </div>
  );
}
