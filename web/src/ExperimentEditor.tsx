import { useEffect, useRef, useState } from "react";
import type { Condition, ExperimentSpec, Plugins } from "./api";

type Props = {
  plugins: Plugins;
  spec: ExperimentSpec;
  onChange: (spec: ExperimentSpec) => void;
  onRun: () => void;
  running: boolean;
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

/** A starting condition that makes sense for each kind of network. */
function defaultConditions(network: string): Condition[] {
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

export function ExperimentEditor({ plugins, spec, onChange, onRun, running }: Props) {
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
              conditions: defaultConditions(e.target.value),
            });
          }}
        >
          {networks.map((n) => (
            <option key={n.name} value={n.name}>{n.name}</option>
          ))}
        </select>
        {net?.description && <p className="hint">{net.description}</p>}
        {Object.entries(net?.parameters ?? {}).map(([key, def]) =>
          typeof def === "number" ? (
            <label key={key} className="inline">
              {key}
              <input
                type="number"
                step="any"
                value={String(spec.network.params[key] ?? def)}
                onChange={(e) =>
                  set({ network: { ...spec.network, params: { ...spec.network.params, [key]: Number(e.target.value) } } })
                }
              />
            </label>
          ) : null,
        )}
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

      <fieldset>
        <legend>Conditions (compared with baseline)</legend>
        {spec.conditions.map((c, i) => {
          const p = c.perturbations[0] ?? { name: "scale_diameter", params: {} };
          const params = p.params as {
            edges?: (string | number)[];
            vessel_types?: string[];
            layers?: number[];
            factor?: number;
          };
          const update = (patch: Record<string, unknown>) =>
            setCondition(i, { ...c, perturbations: [{ name: "scale_diameter", params: { ...params, ...patch } }] });
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

      <button className="primary" onClick={onRun} disabled={running}>
        {running ? "Running…" : "Run experiment"}
      </button>
    </div>
  );
}
