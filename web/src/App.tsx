import { useEffect, useMemo, useState } from "react";
import { api, type ExperimentSpec, type NetworkResponse, type Plugins, type RunEntry, type RunRecord } from "./api";
import { EdgeTable } from "./EdgeTable";
import { ExperimentEditor } from "./ExperimentEditor";
import { Legend } from "./Legend";
import { NetworkView } from "./NetworkView";
import { fmt, pct, toNlPerMin, toUm } from "./units";
import { type ColorBy, colorByKey, colorByOptions, computeView } from "./viz";

function defaultSpec(plugins: Plugins): ExperimentSpec {
  const nets = plugins.network?.plugins ?? [];
  const net = nets.find((n) => n.name === "suarez2021a") ?? nets[0];
  return {
    name: "Arterial blood stealing",
    description: "Dilate one daughter arteriole by 30% and compare with the baseline.",
    network: { name: net?.name ?? "", params: { ...(net?.parameters ?? {}) } },
    solver: { viscosity: "pries_invivo", phase_separation: "pries" },
    conditions: [
      {
        label: "dilate_active_30pct",
        perturbations: [{ name: "scale_diameter", params: { edges: ["active_edge"], factor: 1.3 } }],
      },
    ],
    spec_version: 1,
  };
}

const sameNetwork = (a: ExperimentSpec, b: ExperimentSpec) =>
  JSON.stringify(a.network) === JSON.stringify(b.network);

export default function App() {
  const [version, setVersion] = useState<string>("");
  const [plugins, setPlugins] = useState<Plugins | null>(null);
  const [spec, setSpec] = useState<ExperimentSpec | null>(null);
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [colorBy, setColorBy] = useState<ColorBy>({ kind: "type" });
  const [hover, setHover] = useState<{ edge: number; x: number; y: number } | null>(null);
  const [rowHover, setRowHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    api.health().then((h) => setVersion(h.version)).catch(fail);
    api.plugins().then((p) => {
      setPlugins(p);
      setSpec(defaultSpec(p));
    }).catch(fail);
    api.runs().then(setRuns).catch(fail);
  }, []);

  // Describe the network whenever its name or parameters change.
  const networkKey = spec ? JSON.stringify(spec.network) : "";
  useEffect(() => {
    if (!spec?.network.name) return;
    const t = setTimeout(() => {
      api.network(spec.network.name, spec.network.params)
        .then((n) => {
          setNetwork(n);
          setError(null);
        })
        .catch(fail);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkKey]);

  // A run is shown only on the network it was computed for.
  const shownRun = run && spec && network && sameNetwork(run.spec, spec) ? run : null;
  const options = useMemo(() => colorByOptions(shownRun), [shownRun]);
  const activeColorBy = options.some((o) => colorByKey(o.value) === colorByKey(colorBy)) ? colorBy : { kind: "type" as const };
  const view = useMemo(
    () => (network ? computeView(network.graph, shownRun, activeColorBy) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network, shownRun, colorByKey(activeColorBy)],
  );

  async function runExperiment() {
    if (!spec) return;
    setRunning(true);
    try {
      const check = await api.validate(spec);
      if (!check.valid) throw new Error(check.error ?? "invalid experiment");
      const record = await api.run(spec);
      setRun(record);
      const first = Object.keys(record.summary)[0];
      setColorBy(first ? { kind: "relflow", label: first } : { kind: "type" });
      setRuns(await api.runs());
      setError(null);
    } catch (e) {
      fail(e);
    } finally {
      setRunning(false);
    }
  }

  async function openRun(id: string) {
    try {
      const record = await api.getRun(id);
      setSpec(record.spec);
      setRun(record);
      const first = Object.keys(record.summary)[0];
      setColorBy(first ? { kind: "relflow", label: first } : { kind: "type" });
    } catch (e) {
      fail(e);
    }
  }

  const highlighted = hover?.edge ?? rowHover;
  // Draw vessels at the diameters of the condition being shown.
  const g = useMemo(() => {
    if (!network) return undefined;
    const label = activeColorBy.kind === "type" ? null : activeColorBy.label;
    const d = label && shownRun?.results[label]?.diameter;
    return d ? { ...network.graph, diameter: d } : network.graph;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, shownRun, colorByKey(activeColorBy)]);

  return (
    <div className="app">
      <header>
        <h1>NeuroVascularSim</h1>
        <span className="muted">{version && `engine ${version}`}</span>
      </header>

      <aside>
        <h2>Experiment</h2>
        {plugins && spec ? (
          <ExperimentEditor plugins={plugins} spec={spec} onChange={setSpec} onRun={runExperiment} running={running} />
        ) : (
          <p className="muted">Connecting to the engine…</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <h2>Runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <ul className="runs">
            {runs.map((r) => (
              <li key={r.id}>
                <button className={run?.id === r.id ? "run active" : "run"} onClick={() => openRun(r.id)}>
                  <span>{r.name}</span>
                  <span className="muted">{r.created.replace("T", " ").replace("+00:00", " UTC")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main>
        <div className="toolbar">
          <label className="inline">
            Colour by
            <select
              value={colorByKey(activeColorBy)}
              onChange={(e) => setColorBy(options.find((o) => colorByKey(o.value) === e.target.value)!.value)}
            >
              {options.map((o) => (
                <option key={colorByKey(o.value)} value={colorByKey(o.value)}>{o.label}</option>
              ))}
            </select>
          </label>
          {shownRun && (
            <span className="muted">
              run {shownRun.id} · {Object.values(shownRun.results).every((f) => f.converged) ? "converged" : "NOT converged"}
            </span>
          )}
        </div>

        <div className="stage">
          {g && view ? (
            <>
              <NetworkView
                graph={g}
                colors={view.colors}
                highlight={highlighted}
                onHover={(edge, x, y) => setHover(edge === null ? null : { edge, x, y })}
              />
              <Legend legend={view.legend} />
              {hover && (
                <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
                  <strong>Edge {hover.edge}</strong> · {g.vessel_type[hover.edge].toLowerCase().replace(/_/g, " ")}
                  <div>D {fmt(toUm(g.diameter[hover.edge]))} µm · L {fmt(toUm(g.length[hover.edge]))} µm</div>
                  {shownRun && (
                    <>
                      <div>Flow {fmt(toNlPerMin(shownRun.results.baseline.flow[hover.edge]))} nL/min · Hct {fmt(shownRun.results.baseline.hematocrit[hover.edge])}</div>
                      {Object.entries(shownRun.summary).map(([label, s]) => (
                        <div key={label}>{label}: {pct(s.relative_flow[hover.edge])}</div>
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

        {network && <EdgeTable graph={network.graph} run={shownRun} selected={highlighted} onSelect={setRowHover} />}
      </main>
    </div>
  );
}
