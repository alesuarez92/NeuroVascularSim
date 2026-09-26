import { useEffect, useRef, useState } from "react";
import type { Condition, DataFile, ExperimentSpec, ParamDocs, Plugins } from "./api";
import { ParamField } from "./ParamField";
import { parseList } from "./params";
import { buildCondition, conditionParts } from "./conditions";

type Props = {
  plugins: Plugins;
  spec: ExperimentSpec;
  onChange: (spec: ExperimentSpec) => void;
  onRun: () => void;
  running: boolean;
  dataFiles: DataFile[];
  onDataFilesChanged: () => void;
  models: Record<"oxygen" | "bold", Record<string, unknown>> | null;
  docs?: Record<string, ParamDocs>; // parameter docs by scope, for labels, symbols and units
};

const VESSEL_TYPES = [
  "ARTERIOLE",
  "PIAL_ARTERY",
  "PENETRATING_ARTERIOLE",
  "PRECAPILLARY_ARTERIOLE",
  "CAPILLARY",
  "VENULE",
  "ASCENDING_VENULE",
];

/**
 * Default solver per network: the in-vitro viscosity law for cortical
 * networks (it reproduces measured perfusion with measured morphology; see
 * docs/networks.md), the in-vivo law for the Suarez et al. 2021 network as in
 * that paper.
 */
export function defaultSolver(network: string): Record<string, unknown> {
  return { viscosity: network === "suarez2021a" ? "pries_invivo" : "pries_invitro", phase_separation: "pries" };
}

/** A starting condition that makes sense for each kind of network. */
export function defaultConditions(network: string): Condition[] {
  if (network === "suarez2021a") {
    return [{ label: "dilate_active_30pct", perturbations: [{ name: "scale_diameter", params: { edges: ["active_edge"], factor: 1.3 } }] }];
  }
  return [
    {
      label: "dilate_arterioles_20pct",
      perturbations: [{ name: "scale_diameter", params: { vessel_types: ["PENETRATING_ARTERIOLE"], factor: 1.2 } }],
    },
  ];
}

function parseTargets(text: string): (string | number)[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/**
 * The experiment form: network and its parameters, solver, oxygen and BOLD
 * models, and the conditions compared with the baseline. The JSON view edits
 * the full spec, for anything the form does not cover.
 */
export function ExperimentEditor({ plugins, spec, onChange, onRun, running, dataFiles, onDataFilesChanged, models, docs = {} }: Props) {
  const networks = plugins.network?.plugins ?? [];
  const net = networks.find((p) => p.name === spec.network.name);
  const set = (patch: Partial<ExperimentSpec>) => onChange({ ...spec, ...patch });
  const setCondition = (i: number, c: Condition) =>
    set({ conditions: spec.conditions.map((x, j) => (j === i ? c : x)) });

  // The JSON view is the full spec: anything the form does not cover can be edited there.
  const [json, setJson] = useState(JSON.stringify(spec, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fromJson = useRef<ExperimentSpec | null>(null);
  useEffect(() => {
    // Reformat only when the spec changed elsewhere, not while typing here.
    if (spec !== fromJson.current) setJson(JSON.stringify(spec, null, 2));
  }, [spec]);

  return (
    <div className="editor">
      <label>
        Name
        <input value={spec.name} onChange={(e) => set({ name: e.target.value })} />
      </label>

      <fieldset>
        <legend>Network</legend>
        <select
          value={spec.network.name}
          onChange={(e) => {
            const p = networks.find((n) => n.name === e.target.value);
            set({
              name: p?.name === "suarez2021a" ? "Arterial blood stealing" : `Experiment on ${e.target.value}`,
              network: { name: e.target.value, params: { ...(p?.parameters ?? {}) } },
              solver: defaultSolver(e.target.value),
              conditions: defaultConditions(e.target.value),
            });
          }}
        >
          {networks.map((n) => (
            <option key={n.name} value={n.name}>{n.name}</option>
          ))}
        </select>
        {net?.description && <p className="hint">{net.description}</p>}
        {Object.entries(net?.parameters ?? {}).map(([key, def]) => (
          <ParamField
            key={`${spec.network.name}:${key}`}
            name={key}
            def={def}
            value={spec.network.params[key]}
            choices={net?.choices?.[key]}
            doc={(net?.docs ?? docs[`network/${spec.network.name}`])?.params?.[key]}
            dataFiles={dataFiles}
            onUploaded={onDataFilesChanged}
            onChange={(v) => set({ network: { ...spec.network, params: { ...spec.network.params, [key]: v } } })}
          />
        ))}
        <button
          className="ghost"
          onClick={() => set({ network: { ...spec.network, params: { ...(net?.parameters ?? {}) } } })}
        >
          Reset to defaults
        </button>
      </fieldset>

      <fieldset>
        <legend>Solver</legend>
        {(["viscosity", "phase_separation"] as const).map((kind) => (
          <label key={kind} className="inline">
            {kind.replace("_", " ")}
            <select
              value={String(spec.solver[kind] ?? "")}
              onChange={(e) => set({ solver: { ...spec.solver, [kind]: e.target.value } })}
            >
              {(plugins[kind]?.plugins ?? []).map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      {models && (
        <fieldset>
          <legend>Oxygen &amp; BOLD</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={spec.oxygen != null}
              onChange={(e) => set(e.target.checked ? { oxygen: {} } : { oxygen: null, bold: null })}
            />
            Simulate oxygen (vessels and tissue)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={spec.bold != null}
              disabled={spec.oxygen == null}
              onChange={(e) => set({ bold: e.target.checked ? {} : null })}
            />
            Simulate BOLD (laminar profiles)
          </label>
          {(["oxygen", "bold"] as const).map((key) =>
            spec[key] != null ? (
              <details key={key}>
                <summary>{key === "oxygen" ? "Oxygen parameters" : "BOLD parameters"}</summary>
                {Object.entries(models[key]).map(([name, def]) => (
                  <ParamField
                    key={`${key}:${name}`}
                    name={name}
                    def={def}
                    value={(spec[key] as Record<string, unknown>)[name]}
                    doc={docs[`model/${key}`]?.params?.[name]}
                    dataFiles={dataFiles}
                    onUploaded={onDataFilesChanged}
                    onChange={(v) => set({ [key]: { ...(spec[key] as Record<string, unknown>), [name]: v } })}
                  />
                ))}
                {key === "bold" && (
                  <p className="hint">
                    Defaults are the 1.5 T, TE 40 ms values of Obata et al. 2004. At other fields set r0 and epsilon
                    yourself; they are not scaled automatically.
                  </p>
                )}
              </details>
            ) : null,
          )}
          {spec.oxygen != null && <p className="hint">Oxygen adds ~1–3 min per solve on a full column; runs go to the background.</p>}
        </fieldset>
      )}

      <fieldset>
        <legend>Conditions (compared with baseline)</legend>
        {spec.conditions.map((c, i) => {
          const { diameter: params, cmro2 } = conditionParts(c);
          const update = (patch: Record<string, unknown>) => setCondition(i, buildCondition(c, { ...params, ...patch }, cmro2));
          const setCmro2 = (f: number | null) => setCondition(i, buildCondition(c, params, f));
          return (
            <div className="condition" key={i}>
              <div className="row">
                <input
                  aria-label="Condition label"
                  value={c.label}
                  onChange={(e) => setCondition(i, { ...c, label: e.target.value })}
                />
                <button
                  className="ghost"
                  onClick={() => set({ conditions: spec.conditions.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>
              <label className="inline">
                Edges
                <input
                  placeholder="e.g. 3, 4 or active_edge"
                  value={(params.edges ?? []).join(", ")}
                  onChange={(e) => update({ edges: parseTargets(e.target.value) })}
                />
              </label>
              <label className="inline">
                Vessel type
                <select
                  value={params.vessel_types?.[0] ?? ""}
                  onChange={(e) => update({ vessel_types: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">—</option>
                  {VESSEL_TYPES.map((t) => (
                    <option key={t} value={t}>{t.toLowerCase().replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>
              <label className="inline">
                Layers
                <input
                  placeholder="e.g. 3 (L4), or 2, 3"
                  value={(params.layers ?? []).join(", ")}
                  onChange={(e) =>
                    update({
                      layers: e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((x) => Number.isInteger(x) && x > 0),
                    })
                  }
                />
              </label>
              <label className="inline">
                Depth (µm)
                <input
                  placeholder="from, to (e.g. 400, 550)"
                  defaultValue={(params.depth_range_um ?? []).join(", ")}
                  key={`depth:${i}:${(params.depth_range_um ?? []).join(",")}`}
                  onBlur={(e) => {
                    const r = (parseList(e.target.value) ?? []).map(Number).filter(Number.isFinite);
                    update({ depth_range_um: r.length === 2 ? r : null });
                  }}
                />
              </label>
              {spec.oxygen != null && (
                <label className="inline">
                  CMRO₂ factor
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    placeholder="unchanged"
                    value={cmro2 ?? ""}
                    title="Tissue oxygen consumption, on the same layers or depth range"
                    onChange={(e) => setCmro2(e.target.value === "" ? null : Number(e.target.value))}
                  />
                </label>
              )}
              <label className="inline">
                Diameter factor
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  value={params.factor ?? 1.3}
                  onChange={(e) => update({ factor: Number(e.target.value) })}
                />
              </label>
            </div>
          );
        })}
        <button
          className="ghost"
          onClick={() =>
            set({
              conditions: [
                ...spec.conditions,
                {
                  label: `condition_${spec.conditions.length + 1}`,
                  perturbations: [{ name: "scale_diameter", params: { edges: [], factor: 1.3 } }],
                },
              ],
            })
          }
        >
          Add condition
        </button>
      </fieldset>

      <details>
        <summary>Spec (JSON)</summary>
        <textarea
          aria-label="Experiment spec JSON"
          value={json}
          spellCheck={false}
          onChange={(e) => {
            setJson(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value) as ExperimentSpec;
              fromJson.current = parsed;
              onChange(parsed);
              setJsonError(null);
            } catch (err) {
              setJsonError((err as Error).message);
            }
          }}
        />
        {jsonError && <p className="error">{jsonError}</p>}
      </details>

      <button className="primary" onClick={onRun}>
        {running ? "Queue another run" : "Run experiment"}
      </button>
      {running && <p className="hint">Running in the background; you can keep editing and exploring.</p>}
    </div>
  );
}
