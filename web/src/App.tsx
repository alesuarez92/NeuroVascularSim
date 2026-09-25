import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type DataFile,
  type Job,
  jobActive,
  type ExperimentSpec,
  type NetworkResponse,
  type Plugins,
  type RunEntry,
  type RunRecord,
} from "./api";
import { SEGMENT_LABELS } from "./colors";
import { EdgeTable } from "./EdgeTable";
import { JobList, runToShow } from "./JobList";
import { ExperimentEditor, defaultSolver } from "./ExperimentEditor";
import { Legend } from "./Legend";
import { NetworkView } from "./NetworkView";
import { SelectionCard } from "./SelectionCard";
import { StatsPanel } from "./StatsPanel";
import { fmt, pct, toNlPerMin, toUm } from "./units";
import { DEFAULT_VIEW, ViewControls, type ViewSettings } from "./ViewControls";
import { type ColorBy, addEdgeToCondition, colorByKey, colorByOptions, computeView, visibleEdges } from "./viz";

function defaultSpec(plugins: Plugins): ExperimentSpec {
  const nets = plugins.network?.plugins ?? [];
  const net = nets.find((n) => n.name === "suarez2021a") ?? nets[0];
  return {
    name: "Arterial blood stealing",
    description: "Dilate one daughter arteriole by 30% and compare with the baseline.",
    network: { name: net?.name ?? "", params: { ...(net?.parameters ?? {}) } },
    solver: defaultSolver(net?.name ?? ""),
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
  const [selected, setSelected] = useState<number | null>(null);
  const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW);
  const [dataFiles, setDataFiles] = useState<DataFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  // Jobs submitted from this page, oldest first: a finished run opens by
  // itself unless a later submission is still pending or already done.
  const [submitted, setSubmitted] = useState<string[]>([]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    api.health().then((h) => setVersion(h.version)).catch(fail);
    api.plugins().then((p) => {
      setPlugins(p);
      setSpec(defaultSpec(p));
    }).catch(fail);
    api.runs().then(setRuns).catch(fail);
    api.dataFiles().then(setDataFiles).catch(fail);
    api.jobs().then(setJobs).catch(fail);
  }, []);

  // Poll while any job is queued or running.
  const anyActive = jobs.some(jobActive);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const submittedRef = useRef(submitted);
  submittedRef.current = submitted;
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(async () => {
      try {
        const next = await api.jobs();
        const wasActive = new Set(jobsRef.current.filter(jobActive).map((j) => j.id));
        const finished = next.filter((j) => !jobActive(j) && wasActive.has(j.id));
        setJobs(next);
        if (!finished.length) return;
        setRuns(await api.runs());
        const show = runToShow(submittedRef.current, next, finished);
        if (show?.status === "done" && show.run_id) await openRun(show.run_id, false);
        if (show?.status === "failed") setError(show.error);
      } catch (e) {
        fail(e);
      }
    }, 800);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyActive]);
  const refreshDataFiles = () => api.dataFiles().then(setDataFiles).catch(fail);

  // Describe the network whenever its name or parameters change.
  const networkKey = spec ? JSON.stringify(spec.network) : "";
  useEffect(() => {
    if (!spec?.network.name) return;
    const t = setTimeout(() => {
      api.network(spec.network.name, spec.network.params)
        .then((n) => {
          setNetwork(n);
          setSelected(null);
          setViewSettings((v) => ({ ...v, depthUm: null }));
          setError(null);
        })
        .catch(fail);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkKey]);

  // A run is shown only on the network it was computed for.
  const shownRun = run && spec && network && sameNetwork(run.spec, spec) ? run : null;
  const options = useMemo(() => colorByOptions(shownRun, network?.graph), [shownRun, network]);
  const activeColorBy = options.some((o) => colorByKey(o.value) === colorByKey(colorBy)) ? colorBy : { kind: "type" as const };
  const view = useMemo(
    () => (network ? computeView(network.graph, shownRun, activeColorBy) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network, shownRun, colorByKey(activeColorBy)],
  );

  async function runExperiment() {
    if (!spec) return;
    try {
      const job = await api.submitJob(spec);
      setJobs((prev) => [job, ...prev]);
      setSubmitted((prev) => [...prev, job.id]);
      setError(null);
    } catch (e) {
      fail(e);
    }
  }

  async function cancelJob(id: string) {
    try {
      const job = await api.cancelJob(id);
      setJobs((prev) => prev.map((j) => (j.id === id ? job : j)));
    } catch (e) {
      fail(e);
    }
  }

  async function openRun(id: string, loadSpec = true) {
    try {
      const record = await api.getRun(id);
      // Opening a past run loads its spec; a finished job keeps the spec being edited.
      if (loadSpec) setSpec(record.spec);
      setRun(record);
      const first = Object.keys(record.summary)[0];
      setColorBy(first ? { kind: "relflow", label: first } : { kind: "type" });
    } catch (e) {
      fail(e);
    }
  }

  const highlighted = hover?.edge ?? rowHover ?? selected;
  const visible = useMemo(
    () => (network ? visibleEdges(network.graph, { hidden: viewSettings.hidden, depthUm: viewSettings.depthUm ?? undefined }) : []),
    [network, viewSettings.hidden, viewSettings.depthUm],
  );

  function addSelectedTo(index: number | "new") {
    if (!spec || selected === null) return;
    setSpec({ ...spec, conditions: addEdgeToCondition(spec.conditions, index, selected) });
  }
  // Draw vessels at the diameters of the condition being shown.
  const g = useMemo(() => {
    if (!network) return undefined;
    const label = "label" in activeColorBy ? activeColorBy.label : null;
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
          <ExperimentEditor
            plugins={plugins}
            spec={spec}
            onChange={setSpec}
            onRun={runExperiment}
            running={jobs.some((j) => submitted.includes(j.id) && jobActive(j))}
            dataFiles={dataFiles}
            onDataFilesChanged={refreshDataFiles}
          />
        ) : (
          <p className="muted">Connecting to the engine…</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <h2>Network statistics</h2>
        {spec ? <StatsPanel network={spec.network} /> : null}

        <h2>Jobs</h2>
        <JobList jobs={jobs} onOpen={(id) => openRun(id)} onCancel={cancelJob} />

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
          {network && <ViewControls graph={network.graph} view={viewSettings} onChange={setViewSettings} />}
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
                fade={hover || rowHover !== null ? 0.55 : 0.3}
                visible={visible}
                widthScale={viewSettings.widthScale}
                onHover={(edge, x, y) => setHover(edge === null ? null : { edge, x, y })}
                onPick={setSelected}
              />
              <Legend legend={view.legend} />
              {selected !== null && selected < g.n_edges && spec && (
                <SelectionCard
                  edge={selected}
                  graph={g}
                  run={shownRun}
                  conditions={spec.conditions}
                  onAddToCondition={addSelectedTo}
                  onClose={() => setSelected(null)}
                />
              )}
              {hover && (
                <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
                  <strong>Vessel {hover.edge}</strong> · {SEGMENT_LABELS[g.vessel_type[hover.edge]] ?? g.vessel_type[hover.edge]}
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

        {network && <EdgeTable graph={network.graph} run={shownRun} selected={highlighted} onHover={setRowHover} onSelect={setSelected} />}
      </main>
    </div>
  );
}
