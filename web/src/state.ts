// The app's state and the logic around it: plugins and docs from the engine,
// the experiment being edited, the network it describes, background jobs,
// runs, and what the network view shows. Windows get values and callbacks
// from this hook. The spec and the opened run are kept in step with other
// browser windows of the app (see sync.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type DataFile,
  type ExperimentSpec,
  type Job,
  jobActive,
  type NetworkResponse,
  type ParamDocs,
  type Plugins,
  type RunEntry,
  type RunRecord,
} from "./api";
import { defaultSolver } from "./ExperimentEditor";
import { runToShow } from "./JobList";
import { CHANNEL, handleSyncMessage, newWindowId, shouldBroadcast, type SyncMessage } from "./sync";
import { DEFAULT_VIEW, type ViewSettings } from "./ViewControls";
import { type ColorBy, addEdgeToCondition, colorByKey, colorByOptions, computeView, visibleEdges } from "./viz";
import type { WinId } from "./windows";

export type Models = Record<"oxygen" | "bold", Record<string, unknown>>;

export function defaultSpec(plugins: Plugins): ExperimentSpec {
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

export function useAppState(options: { onPopIn?: (w: WinId) => void } = {}) {
  const [version, setVersion] = useState<string>("");
  const [plugins, setPlugins] = useState<Plugins | null>(null);
  const [docs, setDocs] = useState<Record<string, ParamDocs>>({});
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
  const [models, setModels] = useState<Models | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  // Jobs submitted from this page, oldest first: a finished run opens by
  // itself unless a later submission is still pending or already done.
  const [submitted, setSubmitted] = useState<string[]>([]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  // ---- Cross-window sync -------------------------------------------------
  const self = useRef(newWindowId());
  const channel = useRef<BroadcastChannel | null>(null);
  const lastSpec = useRef(""); // JSON of the spec last sent or received
  const lastRun = useRef<string | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  const runRef = useRef(run);
  runRef.current = run;
  const popInRef = useRef(options.onPopIn);
  popInRef.current = options.onPopIn;
  const post = (m: SyncMessage) => {
    try {
      channel.current?.postMessage(m);
    } catch {
      // A closed channel or an uncloneable value: windows just stop syncing.
    }
  };

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (ev) => {
      const action = handleSyncMessage(ev.data, self.current, JSON.stringify(specRef.current), runRef.current?.id ?? null);
      if (action.kind === "spec") {
        lastSpec.current = action.json;
        setSpec(action.spec);
      } else if (action.kind === "run") {
        lastRun.current = action.runId;
        if (action.runId) openRun(action.runId, false);
        else setRun(null);
      } else if (action.kind === "reply") {
        if (specRef.current) post({ source: self.current, kind: "spec", spec: specRef.current });
        if (runRef.current) post({ source: self.current, kind: "run", runId: runRef.current.id });
      } else if (action.kind === "popin") {
        popInRef.current?.(action.window);
      }
    };
    post({ source: self.current, kind: "hello" });
    return () => {
      ch.close();
      channel.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!spec) return;
    const json = JSON.stringify(spec);
    if (!shouldBroadcast(json, lastSpec.current)) return;
    lastSpec.current = json;
    post({ source: self.current, kind: "spec", spec });
  }, [spec]);

  useEffect(() => {
    const id = run?.id ?? null;
    if (id === lastRun.current) return;
    lastRun.current = id;
    post({ source: self.current, kind: "run", runId: id });
  }, [run]);

  const sendPopIn = (w: WinId) => post({ source: self.current, kind: "popin", window: w });

  // ---- Loading -----------------------------------------------------------
  useEffect(() => {
    api.health().then((h) => setVersion(h.version)).catch(fail);
    api.plugins().then((p) => {
      setPlugins(p);
      setSpec((s) => {
        if (s) return s; // another window already sent the spec it shows
        const d = defaultSpec(p);
        lastSpec.current = JSON.stringify(d); // the default is not news to other windows
        return d;
      });
    }).catch(fail);
    // Older engines have no /api/docs: forms fall back to parameter names.
    api.docs().then(setDocs).catch(() => setDocs({}));
    api.runs().then(setRuns).catch(fail);
    api.dataFiles().then(setDataFiles).catch(fail);
    api.jobs().then(setJobs).catch(fail);
    api.models().then(setModels).catch(fail);
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
  const refreshJobs = () => {
    api.jobs().then(setJobs).catch(fail);
    api.runs().then(setRuns).catch(fail);
  };

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
  const colorOptions = useMemo(() => colorByOptions(shownRun, network?.graph), [shownRun, network]);
  const activeColorBy = colorOptions.some((o) => colorByKey(o.value) === colorByKey(colorBy)) ? colorBy : { kind: "type" as const };
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
  const drawnGraph = useMemo(() => {
    if (!network) return undefined;
    const label = "label" in activeColorBy ? activeColorBy.label : null;
    const d = label && shownRun?.results[label]?.diameter;
    return d ? { ...network.graph, diameter: d } : network.graph;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, shownRun, colorByKey(activeColorBy)]);

  const running = jobs.some((j) => submitted.includes(j.id) && jobActive(j));

  return {
    version, plugins, docs, spec, setSpec, network, run, shownRun, runs, jobs, models, dataFiles, error, setError,
    colorBy: activeColorBy, setColorBy, colorOptions, view, drawnGraph, hover, setHover, rowHover, setRowHover,
    selected, setSelected, highlighted, visible, viewSettings, setViewSettings, running,
    runExperiment, cancelJob, openRun, addSelectedTo, refreshDataFiles, refreshJobs, sendPopIn,
  };
}

export type AppState = ReturnType<typeof useAppState>;
