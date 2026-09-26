// Typed client for the NeuroVascularSim HTTP API (src/neurovascularsim/server/app.py).

export type PluginInfo = {
  name: string;
  description: string;
  reference: string;
  parameters: Record<string, unknown>;
  choices: Record<string, unknown[]>;
  docs?: ParamDocs; // meaning, unit, group, level and source of each parameter (may be empty)
};

/** Documentation of one parameter (src/neurovascularsim/paramdocs.py). */
export type ParamDoc = {
  label: string;
  help: string;
  unit: string;
  group: string;
  level: "basic" | "advanced";
  source: string;
};

export type ParamDocs = { groups: string[]; params: Record<string, ParamDoc> };

/** Standard outputs of one solve for a whole column and its regions (vascular/summary.py). */
export type MesoscopicSummary = {
  resolution?: string;
  column: Record<string, number | null>;
  regions: Record<string, Record<string, number | null>>;
};

export type Plugins = Record<string, { contract: string; plugins: PluginInfo[] }>;

export type Graph = {
  n_nodes: number;
  n_edges: number;
  positions: number[][]; // m
  edges: number[][];
  diameter: number[]; // m
  length: number[]; // m
  vessel_type: string[];
  depth?: number[]; // m, per node
  layer?: number[]; // 1-based layer index per node, 0 if unknown
  meta: Record<string, unknown>;
};

export type NetworkResponse = {
  graph: Graph;
  pressure_bc: Record<string, number>;
  inlet_hematocrit: number;
  meta: Record<string, unknown>;
};

export type Component = { name: string; params: Record<string, unknown> };
export type Condition = { label: string; perturbations: Component[] };

export type ExperimentSpec = {
  name: string;
  description?: string;
  network: Component;
  solver: Record<string, unknown>;
  conditions: Condition[];
  oxygen?: Record<string, unknown> | null;
  bold?: Record<string, unknown> | null;
  spec_version: number;
};

export type OxygenSummary = {
  oef: number | null;
  arteriolar_extraction_fraction: number | null;
  cmro2_umol_per_g_min: number;
  o2_balance: number | null;
  tissue_po2_mean: number;
  tissue_po2_p10: number;
  hypoxic_fraction: number;
  iterations: number;
  converged: boolean;
  depth_profile?: { depth_um: number[]; tissue_po2_mean: number[]; tissue_po2_p10: number[] };
};

export type TissueSlice = { po2_mmhg: number[][]; voxel_um: number; origin_um: number[] };

export type BoldProfile = {
  depth_um: number[];
  signal_change_pct: number[];
  extravascular_pct: number[];
  intravascular_pct: number[];
  column_signal_change_pct: number;
  by_class_pct: Record<string, number>;
  params: Record<string, number>;
};

export type Fields = {
  pressure: number[]; // Pa, per node
  flow: number[]; // m^3/s, per edge
  hematocrit: number[];
  viscosity: number[];
  diameter: number[]; // m
  iterations: number;
  converged: boolean;
  po2?: number[]; // mmHg, per edge
  so2?: number[];
  oxygen?: OxygenSummary;
  tissue_slice?: TissueSlice;
  mesoscopic?: Record<string, MesoscopicSummary>; // by resolution: "column", "layer"
};

export type RunRecord = {
  id: string;
  spec: ExperimentSpec;
  created: string;
  provenance: Record<string, unknown>;
  results: Record<string, Fields>;
  summary: Record<string, { relative_flow: (number | null)[]; hematocrit_change: number[]; bold?: BoldProfile }>;
};

export type ClassStats = {
  length_um: { n: number; median: number; mean: number; p10: number; p90: number };
  diameter_um: { n: number; median: number; mean: number; p10: number; p90: number };
  length_density_m_per_mm3: number | null;
  volume_fraction: number | null;
  tortuosity_mean?: number | null;
};

export type NetworkStats = {
  statistics: {
    volume_mm3: number;
    n_nodes: number;
    n_edges: number;
    arterial?: ClassStats;
    capillary?: ClassStats;
    venous?: ClassStats;
    vascular_volume_fraction?: number | null;
    degree_fractions: Record<string, number>;
    [key: string]: unknown;
  };
  branch_order: {
    mean_order_from_arterial: number | null;
    mean_order_from_venous: number | null;
    mean_order_nearest: number | null;
    median_arterial_to_venous_path: number | null;
  };
  tissue_distance?: { mean_um: number; median_um: number; p99_um: number } | null;
};

export type DataFile = { name: string; size: number };

export type Job = {
  id: string;
  name: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  stage: string;
  done: number;
  total: number;
  created: string;
  started: string | null;
  finished: string | null;
  run_id: string | null;
  error: string | null;
};

export const jobActive = (j: Job) => j.status === "queued" || j.status === "running";

export type RunEntry = { id: string; name: string; created: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (body as { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : `${res.status} ${res.statusText}`);
  }
  return body as T;
}

const post = <T,>(path: string, data: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  health: () => request<{ status: string; version: string }>("/api/health"),
  plugins: () => request<Plugins>("/api/plugins"),
  docs: () => request<Record<string, ParamDocs>>("/api/docs"),
  models: () => request<Record<"oxygen" | "bold", Record<string, unknown>>>("/api/models"),
  network: (name: string, params: Record<string, unknown>) =>
    post<NetworkResponse>("/api/networks", { name, params }),
  networkStats: (name: string, params: Record<string, unknown>) =>
    post<NetworkStats>("/api/networks/stats", { name, params }),
  dataFiles: () => request<DataFile[]>("/api/data-files"),
  uploadDataFile: (file: File) =>
    request<DataFile>(`/api/data-files/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      body: file,
      headers: { "content-type": "text/csv" },
    }),
  validate: (spec: ExperimentSpec) =>
    post<{ valid: boolean; error?: string }>("/api/experiments/validate", spec),
  run: (spec: ExperimentSpec) => post<RunRecord>("/api/runs", spec),
  submitJob: (spec: ExperimentSpec) => post<Job>("/api/jobs", spec),
  jobs: () => request<Job[]>("/api/jobs"),
  cancelJob: (id: string) => request<Job>(`/api/jobs/${id}`, { method: "DELETE" }),
  runs: () => request<RunEntry[]>("/api/runs"),
  getRun: (id: string) => request<RunRecord>(`/api/runs/${id}`),
};
