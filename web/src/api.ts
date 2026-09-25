// Typed client for the NeuroVascularSim HTTP API (src/neurovascularsim/server/app.py).

export type PluginInfo = {
  name: string;
  description: string;
  reference: string;
  parameters: Record<string, unknown>;
  choices: Record<string, unknown[]>;
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
  spec_version: number;
};

export type Fields = {
  pressure: number[]; // Pa, per node
  flow: number[]; // m^3/s, per edge
  hematocrit: number[];
  viscosity: number[];
  diameter: number[]; // m
  iterations: number;
  converged: boolean;
};

export type RunRecord = {
  id: string;
  spec: ExperimentSpec;
  created: string;
  provenance: Record<string, unknown>;
  results: Record<string, Fields>;
  summary: Record<string, { relative_flow: (number | null)[]; hematocrit_change: number[] }>;
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
  runs: () => request<RunEntry[]>("/api/runs"),
  getRun: (id: string) => request<RunRecord>(`/api/runs/${id}`),
};
