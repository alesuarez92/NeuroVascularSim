import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api, type Component, type Condition, type ExperimentSpec, type ParamDocs, type Plugins } from "./api";
import { BloodFigure } from "./diagrams/BloodFigure";
import { BoldFigure } from "./diagrams/BoldFigure";
import { Bifurcation } from "./diagrams/Bifurcation";
import { CorticalColumn } from "./diagrams/CorticalColumn";
import { ColumnMini, DilationMini, PressureMini, miniFor } from "./diagrams/mini";
import { OxygenFigure } from "./diagrams/OxygenFigure";
import { type FigureKind, networkFigure, regionOfGroup, regionOfParam } from "./diagrams/regions";
import { DocField, HelpButton, Linked } from "./DocField";
import { MathSymbol } from "./MathSymbol";
import { ExperimentEditor, defaultConditions, defaultSolver } from "./ExperimentEditor";
import { parseList } from "./params";
import type { AppState } from "./state";
import {
  type Field,
  type FieldGroup,
  LAYERS,
  LAYER_SOURCE,
  PRESETS,
  SOLVER_NUMBERS,
  VESSEL_TYPES,
  changedSettings,
  checkSpec,
  countAdvanced,
  describePerturbation,
  filterLevel,
  formatValue,
  groupFields,
  networkStep,
  presetAvailability,
  resolveDoc,
  toggleIn,
} from "./wizard";

const STEPS = ["Network", "Blood & flow", "Boundary conditions", "Oxygen & BOLD", "Conditions", "Review & run"] as const;

type Props = { s: AppState; onShowResults: () => void; onShowNetwork: () => void };

/** A fresh spec for another network: its defaults, the matching solver and a starting condition. */
function switchNetwork(spec: ExperimentSpec, plugins: Plugins, name: string): ExperimentSpec {
  const p = plugins.network?.plugins.find((n) => n.name === name);
  return {
    ...spec,
    name: name === "suarez2021a" ? "Arterial blood stealing" : `Experiment on ${name}`,
    description: "",
    network: { name, params: { ...(p?.parameters ?? {}) } },
    solver: defaultSolver(name),
    conditions: defaultConditions(name),
  };
}

/**
 * The guided setup: one step per part of the experiment, each with a short
 * physiological introduction, a schematic figure whose parts lead to their
 * parameters, and the parameters themselves (basic ones first, advanced on
 * request). The last step reviews what differs from the defaults and runs.
 */
export function SetupWizard({ s, onShowResults, onShowNetwork }: Props) {
  const { plugins, spec, setSpec, docs, models } = s;
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [hoverRegion, setHoverRegion] = useState<{ fig: FigureKind; region: string } | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    body.current?.scrollTo?.({ top: 0 });
    setActiveField(null);
    setHoverRegion(null);
  }, [step]);

  if (!plugins || !spec) return <p className="muted pad">Connecting to the engine…</p>;

  const net = plugins.network?.plugins.find((p) => p.name === spec.network.name);
  const netDocs: ParamDocs | undefined = net?.docs?.params && Object.keys(net.docs.params).length ? net.docs : docs[`network/${spec.network.name}`];
  const netValues = { ...(net?.parameters ?? {}), ...spec.network.params };
  const netFig = networkFigure(spec.network.name);
  const setNetParam = (k: string, v: unknown) => setSpec({ ...spec, network: { ...spec.network, params: { ...spec.network.params, [k]: v } } });
  const netGroups = (which: string) => {
    const groups = groupFields(net?.parameters ?? {}, netDocs, net?.choices, (name, doc) => networkStep(name, doc) === which);
    if (which !== "bc") return groups;
    // Everything on this step is a boundary condition, whichever group the docs file it under.
    const fields = groups.flatMap((g) => g.fields);
    return fields.length ? [{ group: groups.find((g) => /boundary/i.test(g.group))?.group ?? "Boundary conditions", fields }] : [];
  };

  // Figure click: go to the first group whose parameters live in that region.
  const selectRegion = (fig: FigureKind, groups: FieldGroup[]) => (region: string) => {
    const g = groups.find((gr) => regionOfGroup(fig, gr.group) === region)
      ?? groups.find((gr) => gr.fields.some((f) => regionOfParam(fig, f.name, f.doc.group) === region));
    if (!g) return;
    if (!filterLevel([g], advanced).length) setAdvanced(true); // only advanced settings there
    setFlash(g.group);
    setTimeout(() => setFlash((x) => (x === g.group ? null : x)), 1400);
    requestAnimationFrame(() =>
      body.current?.querySelector(`[data-group="${CSS.escape(g.group)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };

  const fieldsProps = (fig: FigureKind, scope: string, values: Record<string, unknown>, figure: (hl: string | null) => ReactNode) => ({
    fig,
    scope,
    values,
    figure,
    advanced,
    flash,
    hoverRegion: hoverRegion?.fig === fig ? hoverRegion.region : null,
    activeField,
    setActiveField,
    onFieldHover: (name: string | null, group?: string) => {
      const region = name ? regionOfParam(fig, name, group) : null;
      setHoverRegion(region ? { fig, region } : null);
    },
    dataFiles: s.dataFiles,
    onUploaded: s.refreshDataFiles,
  });
  const hl = (fig: FigureKind, fallback: string | null = null) => (hoverRegion?.fig === fig ? hoverRegion.region : fallback);
  const onFigHover = (fig: FigureKind) => (region: string | null) => setHoverRegion(region ? { fig, region } : null);

  const networkFigureEl = (highlight: string | null, onSelect?: (r: string) => void) =>
    netFig === "column" ? (
      <CorticalColumn
        depthUm={Number(netValues.depth_um ?? 1200)}
        sizeXUm={typeof netValues.size_x_um === "number" ? netValues.size_x_um : undefined}
        highlight={highlight}
        onSelect={onSelect}
        onHover={onSelect ? onFigHover("column") : undefined}
      />
    ) : (
      <Bifurcation values={netValues} highlight={highlight} onSelect={onSelect} onHover={onSelect ? onFigHover("bifurcation") : undefined} />
    );

  let content: ReactNode = null;
  let hidden = 0;

  if (step === 0) {
    const groups = netGroups("network");
    hidden = advanced ? 0 : countAdvanced(groups);
    content = (
      <Step
        intro={
          <>
            <p>
              The cortex is supplied from the brain surface: <b>penetrating arterioles</b> dive from the pial arteries
              into the tissue and <b>ascending venules</b> carry blood back up. Between them lies a dense <b>capillary
              bed</b>, reached through short arteriolar and venular offshoots. Oxygen exchange happens mostly there.
            </p>
            <p>Choose which network to simulate, then its geometry. Click a part of the figure to jump to its settings.</p>
          </>
        }
        before={
          <fieldset className="network-choice">
            <legend>Network</legend>
            {(plugins.network?.plugins ?? []).map((p) => (
              <label key={p.name} className={`choice-card${p.name === spec.network.name ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="network"
                  checked={p.name === spec.network.name}
                  onChange={() => setSpec(switchNetwork(spec, plugins, p.name))}
                />
                <span>
                  <strong>{p.name.replace(/_/g, " ")}</strong>
                  {p.name === spec.network.name ? (
                    <>
                      <span className="hint">{p.description}</span>
                      {p.reference && <span className="ref"><Linked text={p.reference} /></span>}
                    </>
                  ) : (
                    <span className="hint one-line">{p.description}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        }
        figure={networkFigureEl(hl(netFig), selectRegion(netFig, groups))}
      >
        <FieldGroups
          groups={groups}
          {...fieldsProps(netFig, "network", netValues, (h) => networkFigureEl(h))}
          onChange={setNetParam}
        />
        <p className="hint">Layer depths: <Linked text={LAYER_SOURCE} />.</p>
      </Step>
    );
  } else if (step === 1) {
    const viscosities = plugins.viscosity?.plugins ?? [];
    const phases = plugins.phase_separation?.plugins ?? [];
    const solverDefaults: Record<string, unknown> = { ...defaultSolver(spec.network.name), ...SOLVER_NUMBERS };
    const solverChoices = { viscosity: viscosities.map((p) => p.name), phase_separation: phases.map((p) => p.name) };
    const solverDocs = docs["model/solver"];
    const solverGroups = groupFields(solverDefaults, solverDocs, solverChoices).map((g) => ({
      ...g,
      // Without docs, the rheology choices are the basic settings of this step.
      fields: g.fields.map((f) => (!f.documented && f.name in solverChoices ? { ...f, doc: { ...f.doc, level: "basic" as const, group: "Rheology" } } : f)),
    }));
    const regrouped = regroup(solverGroups);
    const blood = netGroups("blood");
    const groups = [...blood, ...regrouped];
    hidden = advanced ? 0 : countAdvanced(groups);
    const hct = Number(netValues.hematocrit ?? NaN);
    const values = { ...solverDefaults, ...spec.solver };
    const vPlugin = viscosities.find((p) => p.name === values.viscosity);
    const pPlugin = phases.find((p) => p.name === values.phase_separation);
    const figure = (h: string | null, onSelect?: (r: string) => void) => (
      <BloodFigure hematocrit={Number.isFinite(hct) ? hct : 0} highlight={h} onSelect={onSelect} onHover={onSelect ? onFigHover("blood") : undefined} />
    );
    content = (
      <Step
        intro={
          <p>
            Blood is a suspension of red cells in plasma. In small vessels the cells crowd to the centre, leaving a
            cell-free layer at the wall, so the apparent <b>viscosity</b> depends on the vessel diameter and the
            <b> hematocrit</b> (the share of blood volume taken by red cells). At branch points the cells do not split
            in proportion to flow: the faster branch receives more (<b>phase separation</b>). The solver iterates flow and
            hematocrit until they agree.
          </p>
        }
        figure={figure(hl("blood"), selectRegion("blood", groups))}
      >
        {blood.length > 0 && (
          <FieldGroups groups={blood} {...fieldsProps("blood", "network", netValues, (h) => figure(h))} onChange={setNetParam} />
        )}
        <FieldGroups
          groups={regrouped}
          {...fieldsProps("blood", "solver", values, (h) => figure(h))}
          onChange={(k, v) => setSpec({ ...spec, solver: { ...spec.solver, [k]: v } })}
        />
        {vPlugin && <p className="hint"><b>Viscosity law:</b> {vPlugin.description} {vPlugin.reference && <Linked text={vPlugin.reference} />}</p>}
        {pPlugin && <p className="hint"><b>Phase separation:</b> {pPlugin.description} {pPlugin.reference && <Linked text={pPlugin.reference} />}</p>}
      </Step>
    );
  } else if (step === 2) {
    const groups = netGroups("bc");
    hidden = advanced ? 0 : countAdvanced(groups);
    const n = (k: string) => (typeof netValues[k] === "number" ? (netValues[k] as number) : null);
    content = (
      <Step
        intro={
          <p>
            Blood moves because the pressure where it enters (the arterial side, <b><MathSymbol symbol="P_{in}" /></b>) is higher than where it
            leaves (the venous side, <b><MathSymbol symbol="P_{out}" /></b>); the network's resistance sets how much flows for that difference.
            Outside the vessels, the <b>tissue pressure</b> (intracranial pressure, ICP) pushes on the walls. Pressures
            are fixed at the network's open ends.
          </p>
        }
        figure={
          <>
            {networkFigureEl(hl(netFig, "bc"), selectRegion(netFig, groups))}
            <PressureMini pin={n("p_in_mmhg") ?? n("p_arterial_mmhg")} pout={n("p_out_mmhg") ?? n("p_venous_mmhg")} icp={n("tissue_pressure_mmhg")} />
          </>
        }
      >
        {groups.length ? (
          <FieldGroups groups={groups} {...fieldsProps(netFig, "network", netValues, (h) => networkFigureEl(h ?? "bc"))} onChange={setNetParam} />
        ) : (
          <p className="muted">This network has no boundary settings of its own.</p>
        )}
      </Step>
    );
  } else if (step === 3) {
    const oxDefaults = models?.oxygen ?? {};
    const boldDefaults = models?.bold ?? {};
    const oxValues = { ...oxDefaults, ...(spec.oxygen ?? {}) };
    const boldValues = { ...boldDefaults, ...(spec.bold ?? {}) };
    const oxGroups = groupFields(oxDefaults, docs["model/oxygen"]);
    const boldGroups = groupFields(boldDefaults, docs["model/bold"]);
    hidden = advanced ? 0 : (spec.oxygen ? countAdvanced(oxGroups) : 0) + (spec.bold ? countAdvanced(boldGroups) : 0);
    const oxFig = (h: string | null, onSelect?: (r: string) => void) => (
      <OxygenFigure values={oxValues} highlight={h} onSelect={onSelect} onHover={onSelect ? onFigHover("oxygen") : undefined} />
    );
    const boldFig = (h: string | null, onSelect?: (r: string) => void) => (
      <BoldFigure values={boldValues} highlight={h} onSelect={onSelect} onHover={onSelect ? onFigHover("bold") : undefined} />
    );
    content = (
      <Step
        intro={
          <p>
            Red cells carry oxygen bound to hemoglobin. Along the capillaries it is released, diffuses through the wall
            and is consumed by the tissue (<b>CMRO₂</b>, the cerebral metabolic rate of oxygen). The BOLD fMRI signal
            follows from where the deoxygenated hemoglobin ends up: it is paramagnetic and dephases the MR signal
            around vessels, read at the echo time <b>TE</b>. Both are optional and run after the flow solution.
          </p>
        }
        figure={
          <>
            {oxFig(hl("oxygen"), spec.oxygen ? selectRegion("oxygen", oxGroups) : undefined)}
            {spec.bold != null && boldFig(hl("bold"), selectRegion("bold", boldGroups))}
          </>
        }
      >
        {!models && <p className="muted">Loading the oxygen and BOLD models…</p>}
        <label className="check">
          <input type="checkbox" checked={spec.oxygen != null} onChange={(e) => setSpec(e.target.checked ? { ...spec, oxygen: {} } : { ...spec, oxygen: null, bold: null })} />
          Simulate oxygen (vessels and tissue)
        </label>
        <label className="check">
          <input type="checkbox" checked={spec.bold != null} disabled={spec.oxygen == null} onChange={(e) => setSpec({ ...spec, bold: e.target.checked ? {} : null })} />
          Simulate BOLD (laminar profiles)
        </label>
        {spec.oxygen != null && <p className="hint">Oxygen adds ~1–3 min per solve on a full column; runs go to the background.</p>}
        {spec.oxygen != null && (
          <FieldGroups
            title="Oxygen"
            groups={oxGroups}
            {...fieldsProps("oxygen", "oxygen", oxValues, (h) => oxFig(h))}
            onChange={(k, v) => setSpec({ ...spec, oxygen: { ...(spec.oxygen ?? {}), [k]: v } })}
          />
        )}
        {spec.bold != null && (
          <>
            <FieldGroups
              title="BOLD"
              groups={boldGroups}
              {...fieldsProps("bold", "bold", boldValues, (h) => boldFig(h))}
              onChange={(k, v) => setSpec({ ...spec, bold: { ...(spec.bold ?? {}), [k]: v } })}
            />
            <p className="hint">
              Defaults are the 1.5 T, TE 40 ms values of Obata et al. 2004. At other fields set r0 and epsilon
              yourself; they are not scaled automatically.
            </p>
          </>
        )}
      </Step>
    );
  } else if (step === 4) {
    content = <ConditionsStep s={s} spec={spec} plugins={plugins} netValues={netValues} />;
  } else {
    content = <ReviewStep s={s} spec={spec} plugins={plugins} onShowResults={onShowResults} />;
  }

  return (
    <div className="wizard">
      <nav className="stepper" aria-label="Setup steps">
        <ol>
          {STEPS.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                className={i === step ? "active" : i < step ? "done" : ""}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span className="num">{i + 1}</span>
                <span className="name">{name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="wizard-options">
        <label className="check">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          Show advanced settings{hidden > 0 && <span className="muted"> ({hidden} hidden)</span>}
        </label>
        {s.selected !== null && (
          <button type="button" className="ghost small" onClick={onShowNetwork}>Vessel {s.selected} selected</button>
        )}
      </div>
      <div className="wizard-body" ref={body}>
        <h2 className="step-title">{step + 1}. {STEPS[step]}</h2>
        {content}
        {s.error && <p className="error" role="alert">{s.error}</p>}
      </div>
      <div className="wizard-footer">
        <button type="button" className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
        <span className="muted">Step {step + 1} of {STEPS.length}</span>
        {step < STEPS.length - 1 ? (
          <button type="button" className="primary-inline" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]} →</button>
        ) : (
          <button type="button" className="primary-inline" disabled={checkSpec(spec).some((i) => i.level === "error")} onClick={() => { s.runExperiment(); onShowResults(); }}>
            {s.running ? "Queue another run" : "Run experiment"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Rename the fallback group of solver settings: rheology choices first, numerics after. */
function regroup(groups: FieldGroup[]): FieldGroup[] {
  return groups.map((g) => (g.group === "Other" ? { ...g, group: "Solver numerics" } : g));
}

function Step({ intro, before, figure, children }: { intro: ReactNode; before?: ReactNode; figure: ReactNode; children: ReactNode }) {
  return (
    <div className="step">
      <div className="step-intro">{intro}</div>
      {before}
      <div className="step-grid">
        <div className="step-figure">{figure}</div>
        <div className="step-fields">{children}</div>
      </div>
    </div>
  );
}

type GroupsProps = {
  title?: string;
  groups: FieldGroup[];
  fig: FigureKind;
  scope: string;
  values: Record<string, unknown>;
  figure: (highlight: string | null) => ReactNode;
  advanced: boolean;
  flash: string | null;
  hoverRegion: string | null;
  activeField: string | null;
  setActiveField: (n: string | null) => void;
  onFieldHover: (name: string | null, group?: string) => void;
  onChange: (name: string, v: unknown) => void;
  dataFiles: AppState["dataFiles"];
  onUploaded: () => void;
};

/** Parameter groups as fieldsets; fields in the hovered figure region are marked. */
function FieldGroups(p: GroupsProps) {
  const shown = filterLevel(p.groups, p.advanced);
  if (!shown.length) return p.groups.length ? <p className="muted">Only advanced settings here; tick “Show advanced settings”.</p> : null;
  return (
    <div className="field-groups">
      {p.title && <h3 className="groups-title">{p.title}</h3>}
      {shown.map((g) => (
        <fieldset key={g.group} data-group={g.group} className={p.flash === g.group ? "flash" : ""}>
          <legend>{g.group}</legend>
          {g.fields.map((f: Field) => {
            const region = regionOfParam(p.fig, f.name, f.doc.group);
            return (
              <div key={`${p.scope}:${f.name}`} className={region && region === p.hoverRegion ? "in-region" : undefined}>
                <DocField
                  field={f}
                  value={p.values[f.name]}
                  onChange={(v) => p.onChange(f.name, v)}
                  dataFiles={p.dataFiles}
                  onUploaded={p.onUploaded}
                  mini={miniFor(p.scope, f.name, p.values)}
                  figure={p.figure(region)}
                  active={p.activeField === f.name}
                  onActivate={(n) => p.onFieldHover(n, f.doc.group)}
                  onFocusField={p.setActiveField}
                />
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

// ---- Step 5: conditions ------------------------------------------------------

function ConditionsStep({ s, spec, plugins, netValues }: { s: AppState; spec: ExperimentSpec; plugins: Plugins; netValues: Record<string, unknown> }) {
  const setSpec = s.setSpec;
  const perturbations = plugins.perturbation?.plugins ?? [];
  const hasLayers = Boolean(s.network?.graph.layer?.some((l) => l > 0));
  const hasDepth = Boolean(s.network?.graph.depth);
  const ctx = { hasLayers, oxygen: spec.oxygen != null, selected: s.selected, network: spec.network.name };
  const setConditions = (conditions: Condition[]) => setSpec({ ...spec, conditions });
  const setCondition = (i: number, c: Condition) => setConditions(spec.conditions.map((x, j) => (j === i ? c : x)));
  const depthUm = Number(netValues.depth_um ?? (s.network?.graph.depth ? Math.max(...s.network.graph.depth) * 1e6 : 1200));
  const sizeXUm = Number(netValues.size_x_um ?? depthUm / 2);
  return (
    <Step
      intro={
        <>
          <p>
            A <b>condition</b> changes the network or the tissue and is compared with the unchanged <b>baseline</b>.
            Widening arterioles mimics functional hyperaemia; narrowing capillaries mimics pericyte constriction; raising
            CMRO₂ in a layer mimics stronger neural activity there. Each change can be limited to vessel classes, to
            cortical layers, to a depth range, or to chosen vessels.
          </p>
        </>
      }
      figure={
        <div className="presets">
          <h3 className="groups-title">Presets</h3>
          {PRESETS.map((p) => {
            const why = presetAvailability(p, ctx);
            return (
              <button
                key={p.id}
                type="button"
                className="preset"
                disabled={why !== null}
                title={why ?? p.description}
                onClick={() => setConditions([...spec.conditions, p.build({ ...ctx, existing: spec.conditions.map((c) => c.label) })])}
              >
                <strong>{p.label}</strong>
                <span className="hint">{why ? `Unavailable: ${why}` : p.description}</span>
              </button>
            );
          })}
        </div>
      }
    >
      {spec.conditions.length === 0 && <p className="muted">No conditions: the run computes the baseline only.</p>}
      {spec.conditions.map((c, i) => (
        <div className="condition-card" key={i}>
          <div className="row">
            <input aria-label={`Label of condition ${i + 1}`} value={c.label} onChange={(e) => setCondition(i, { ...c, label: e.target.value })} />
            <button type="button" className="ghost small" onClick={() => setConditions(spec.conditions.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {c.perturbations.map((p, k) => (
            <PerturbationEditor
              key={k}
              p={p}
              plugins={plugins}
              docs={s.docs}
              kinds={perturbations.map((x) => x.name)}
              hasLayers={hasLayers}
              hasDepth={hasDepth}
              depthUm={depthUm}
              sizeXUm={sizeXUm}
              netValues={netValues}
              oxygen={spec.oxygen != null}
              selected={s.selected}
              onChange={(np) => setCondition(i, { ...c, perturbations: c.perturbations.map((x, j) => (j === k ? np : x)) })}
              onRemove={() => setCondition(i, { ...c, perturbations: c.perturbations.filter((_, j) => j !== k) })}
            />
          ))}
          <div className="row">
            <button type="button" className="ghost small" onClick={() => setCondition(i, { ...c, perturbations: [...c.perturbations, { name: "scale_diameter", params: { vessel_types: [], factor: 1.2 } }] })}>
              + Diameter change
            </button>
            {perturbations.some((x) => x.name === "scale_cmro2") && (
              <button type="button" className="ghost small" disabled={spec.oxygen == null} title={spec.oxygen == null ? "Turn on oxygen in step 4 first" : undefined}
                onClick={() => setCondition(i, { ...c, perturbations: [...c.perturbations, { name: "scale_cmro2", params: { factor: 1.1, layers: [], depth_range_um: null } }] })}>
                + CMRO₂ change
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => setConditions([...spec.conditions, { label: `condition_${spec.conditions.length + 1}`, perturbations: [{ name: "scale_diameter", params: { vessel_types: [], factor: 1.2 } }] }])}
      >
        Add an empty condition
      </button>
    </Step>
  );
}

function PerturbationEditor({ p, plugins, docs, kinds, hasLayers, hasDepth, depthUm, sizeXUm, netValues, oxygen, selected, onChange, onRemove }: {
  p: Component;
  plugins: Plugins;
  docs: Record<string, ParamDocs>;
  kinds: string[];
  hasLayers: boolean;
  hasDepth: boolean;
  depthUm: number;
  sizeXUm: number;
  netValues: Record<string, unknown>;
  oxygen: boolean;
  selected: number | null;
  onChange: (p: Component) => void;
  onRemove: () => void;
}) {
  const plugin = plugins.perturbation?.plugins.find((x) => x.name === p.name);
  const pDocs = plugin?.docs?.params && Object.keys(plugin.docs.params).length ? plugin.docs : docs[`perturbation/${p.name}`];
  const defs = plugin?.parameters ?? {};
  const q = p.params as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange({ ...p, params: { ...q, ...patch } });
  const factor = Number(q.factor ?? defs.factor ?? 1);
  const layers = (Array.isArray(q.layers) ? q.layers : []) as number[];
  const types = (Array.isArray(q.vessel_types) ? q.vessel_types : []) as string[];
  const edges = (Array.isArray(q.edges) ? q.edges : []) as (string | number)[];
  const range = Array.isArray(q.depth_range_um) ? (q.depth_range_um as number[]) : null;
  const isCmro2 = p.name === "scale_cmro2";
  const help = (name: string, figure?: ReactNode) => {
    const { doc } = resolveDoc(name, pDocs);
    return <HelpButton doc={doc} name={name} def={defs[name]} value={q[name]} figure={figure} />;
  };
  const label = (name: string, fallback: string) => {
    const r = resolveDoc(name, pDocs);
    if (!r.documented) return fallback;
    return (
      <>
        {r.doc.label}
        {r.doc.symbol && <> <MathSymbol symbol={r.doc.symbol} /></>}
        {r.doc.unit && <span className="unit"> ({r.doc.unit})</span>}
      </>
    );
  };
  const column = (
    <ColumnMini
      title="Where the change applies"
      sizeXUm={sizeXUm}
      depthUm={depthUm}
      layers={isCmro2 ? [] : layers}
      depthRange={isCmro2 ? null : range}
      cmro2={isCmro2 ? { factor, layers, depthRange: range } : null}
    />
  );
  const preview = isCmro2 ? column : (
    <div className="preview-pair">
      {isBifurcation(netValues) && edges.includes("active_edge") ? (
        <Bifurcation values={netValues} activeFactor={factor} />
      ) : (
        <DilationMini factor={factor} vesselTypes={types} />
      )}
      {hasDepth && column}
    </div>
  );
  const [edgeText, setEdgeText] = useState(edges.join(", "));
  useEffect(() => setEdgeText(edges.join(", ")), [edges.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="perturbation">
      <div className="row between">
        <select aria-label="Kind of change" value={p.name} onChange={(e) => onChange({ name: e.target.value, params: { ...(plugins.perturbation?.plugins.find((x) => x.name === e.target.value)?.parameters ?? {}) } })}>
          {kinds.map((k) => (
            <option key={k} value={k} disabled={k === "scale_cmro2" && !oxygen}>
              {k === "scale_diameter" ? "Diameter change" : k === "scale_cmro2" ? "CMRO₂ change" : k}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" aria-label="Remove this change" title="Remove this change" onClick={onRemove}>✕</button>
      </div>
      <p className="describe">{describePerturbation(p)}</p>
      <div className="perturbation-grid">
        <div className="perturbation-fields">
          <div className="pf-row">
            <label htmlFor={`f-${p.name}`}>{label("factor", isCmro2 ? "CMRO₂ factor" : "Diameter factor")}</label>
            <input
              id={`f-${p.name}`}
              type="range"
              min={isCmro2 ? 0.5 : 0.5}
              max={isCmro2 ? 1.5 : 2}
              step={0.01}
              value={factor}
              onChange={(e) => set({ factor: Number(e.target.value) })}
            />
            <input type="number" step="0.05" min="0.05" aria-label="factor value" className="num-sm" value={factor} onChange={(e) => set({ factor: Number(e.target.value) })} />
            {help("factor", preview)}
          </div>
          {!isCmro2 && (
            <div className="pf-row wrap">
              <span className="pf-label">{label("vessel_types", "Vessel classes")}</span>
              <div className="chips">
                {VESSEL_TYPES.map((t) => (
                  <label key={t} className={`chip${types.includes(t) ? " on" : ""}`}>
                    <input type="checkbox" checked={types.includes(t)} onChange={() => set({ vessel_types: toggleIn(types, t) })} />
                    {t.toLowerCase().replace(/_/g, " ")}
                  </label>
                ))}
              </div>
              {help("vessel_types", <DilationMini factor={factor} vesselTypes={types} />)}
            </div>
          )}
          {hasLayers && (
            <div className="pf-row wrap">
              <span className="pf-label">{label("layers", "Layers")}</span>
              <div className="chips">
                {LAYERS.map((l) => (
                  <label key={l.index} className={`chip${layers.includes(l.index) ? " on" : ""}`}>
                    <input type="checkbox" checked={layers.includes(l.index)} onChange={() => set({ layers: toggleIn(layers, l.index).sort() })} />
                    {l.name}
                  </label>
                ))}
              </div>
              {help("layers", column)}
            </div>
          )}
          {hasDepth && (
            <div className="pf-row three">
              <span className="pf-label">{label("depth_range_um", "Depth range (µm)")}</span>
              <DepthRange value={range} max={depthUm} onChange={(r) => set({ depth_range_um: r })} />
              {help("depth_range_um", column)}
            </div>
          )}
          {!isCmro2 && (
            <div className="pf-row three">
              <label htmlFor={`e-${p.name}`} className="pf-label">{label("edges", "Vessels")}</label>
              <input
                id={`e-${p.name}`}
                placeholder="e.g. 3, 4 or active_edge"
                value={edgeText}
                onChange={(e) => setEdgeText(e.target.value)}
                onBlur={() => set({ edges: (parseList(edgeText) ?? []).map((x) => (typeof x === "number" ? Math.round(x) : x)) })}
              />
              {help("edges")}
            </div>
          )}
          {!isCmro2 && selected !== null && !edges.includes(selected) && (
            <button type="button" className="ghost small" onClick={() => set({ edges: [...edges, selected] })}>+ Add selected vessel {selected}</button>
          )}
          {isCmro2 && !oxygen && <p className="error">Needs the oxygen model: turn it on in step 4.</p>}
        </div>
        <div className="perturbation-preview" aria-label="Live preview">{preview}</div>
      </div>
    </div>
  );
}

const isBifurcation = (netValues: Record<string, unknown>) => "d_daughter_um" in netValues;

function DepthRange({ value, max, onChange }: { value: number[] | null; max: number; onChange: (r: number[] | null) => void }) {
  const [lo, setLo] = useState(value ? String(value[0]) : "");
  const [hi, setHi] = useState(value ? String(value[1]) : "");
  useEffect(() => {
    setLo(value ? String(value[0]) : "");
    setHi(value ? String(value[1]) : "");
  }, [value?.[0], value?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (a: string, b: string) => {
    if (a.trim() === "" && b.trim() === "") return onChange(null);
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y) && a.trim() !== "" && b.trim() !== "") onChange([x, y]);
  };
  return (
    <span className="depth-range">
      <input type="number" aria-label="from depth (µm)" placeholder="0" min={0} max={max} value={lo} onChange={(e) => setLo(e.target.value)} onBlur={() => commit(lo, hi)} />
      –
      <input type="number" aria-label="to depth (µm)" placeholder={String(Math.round(max))} min={0} max={max} value={hi} onChange={(e) => setHi(e.target.value)} onBlur={() => commit(lo, hi)} />
      {value && <button type="button" className="icon-btn" aria-label="Whole depth" title="Whole depth" onClick={() => onChange(null)}>✕</button>}
    </span>
  );
}

// ---- Step 6: review ------------------------------------------------------------

function ReviewStep({ s, spec, plugins, onShowResults }: { s: AppState; spec: ExperimentSpec; plugins: Plugins; onShowResults: () => void }) {
  const issues = checkSpec(spec);
  const changes = changedSettings(spec, plugins, s.docs, s.models, defaultSolver(spec.network.name));
  const [server, setServer] = useState<{ valid: boolean; error?: string } | null>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    setServer(null);
    const t = setTimeout(() => api.validate(spec).then(setServer).catch((e) => setServer({ valid: false, error: String(e.message ?? e) })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const errors = issues.filter((i) => i.level === "error");
  const sections = useMemo(() => [...new Set(changes.map((c) => c.section))], [changes]);
  return (
    <div className="step review">
      <label>
        Experiment name
        <input value={spec.name} onChange={(e) => s.setSpec({ ...spec, name: e.target.value })} />
      </label>
      <label>
        Description
        <input value={spec.description ?? ""} placeholder="What this experiment tests" onChange={(e) => s.setSpec({ ...spec, description: e.target.value })} />
      </label>

      <h3 className="groups-title">Network</h3>
      <p>{spec.network.name.replace(/_/g, " ")}{spec.oxygen ? " · oxygen" : ""}{spec.bold ? " · BOLD" : ""}</p>

      <h3 className="groups-title">Changed from the defaults</h3>
      {changes.length === 0 ? (
        <p className="muted">Everything is at its default.</p>
      ) : (
        <table className="review-table">
          <tbody>
            {sections.map((sec) => changes.filter((c) => c.section === sec).map((c, i) => (
              <tr key={`${sec}:${c.name}`}>
                <td className="muted">{i === 0 ? sec : ""}</td>
                <td>{c.label}</td>
                <td className="num"><b>{formatValue(c.value)}</b>{c.unit ? ` ${c.unit}` : ""}</td>
                <td className="muted">default {formatValue(c.def)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      )}

      <h3 className="groups-title">Conditions compared with the baseline</h3>
      {spec.conditions.length === 0 ? <p className="muted">None: baseline only.</p> : (
        <ul className="review-conditions">
          {spec.conditions.map((c, i) => (
            <li key={i}><b>{c.label || "(no label)"}</b>: {c.perturbations.map(describePerturbation).join("; ") || "no change"}</li>
          ))}
        </ul>
      )}

      <h3 className="groups-title">Checks</h3>
      <ul className="issues">
        {issues.map((i, k) => <li key={k} className={i.level}>{i.level === "error" ? "✗" : "!"} {i.message}</li>)}
        {server === null ? <li className="muted">Asking the engine…</li> : server.valid ? (
          <li className="ok">✓ The engine accepts this experiment.</li>
        ) : (
          <li className="error">✗ Engine: {server.error}</li>
        )}
      </ul>

      <button type="button" className="primary" disabled={errors.length > 0} onClick={() => { s.runExperiment(); onShowResults(); }}>
        {s.running ? "Queue another run" : "Run experiment"}
      </button>
      {s.running && <p className="hint">Running in the background; you can keep editing and exploring.</p>}

      <details className="advanced-editor">
        <summary>Advanced: full editor and JSON</summary>
        <ExperimentEditor
          plugins={plugins}
          spec={spec}
          onChange={s.setSpec}
          onRun={s.runExperiment}
          running={s.running}
          dataFiles={s.dataFiles}
          onDataFilesChanged={s.refreshDataFiles}
          models={s.models}
          docs={s.docs}
        />
      </details>
    </div>
  );
}
