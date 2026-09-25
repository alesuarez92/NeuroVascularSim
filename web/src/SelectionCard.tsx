import { Fragment } from "react";
import type { Condition, Graph, RunRecord } from "./api";
import { SEGMENT_LABELS } from "./colors";
import { fmt, pct, toMmHg, toNlPerMin, toUm } from "./units";

type Props = {
  edge: number;
  graph: Graph;
  run: RunRecord | null;
  conditions: Condition[];
  onAddToCondition: (index: number | "new") => void;
  onClose: () => void;
};

/** Details of the vessel clicked in the 3D view, and actions on it. */
export function SelectionCard({ edge, graph, run, conditions, onAddToCondition, onClose }: Props) {
  const [a, b] = graph.edges[edge];
  const depthUm = graph.depth ? toUm(0.5 * (graph.depth[a] + graph.depth[b])) : null;
  const layerNames = (graph.meta.layer_names as string[] | undefined) ?? [];
  const layer = graph.layer ? graph.layer[a] : 0;
  const base = run?.results.baseline;
  const inCondition = conditions.map((c) =>
    c.perturbations.some((p) => ((p.params.edges as unknown[] | undefined) ?? []).includes(edge)),
  );
  return (
    <div className="selection" role="dialog" aria-label={`Vessel ${edge}`}>
      <div className="row between">
        <strong>Vessel {edge}</strong>
        <button className="ghost small" onClick={onClose} aria-label="Close">×</button>
      </div>
      <dl>
        <dt>Segment</dt>
        <dd>{SEGMENT_LABELS[graph.vessel_type[edge]] ?? graph.vessel_type[edge]}</dd>
        <dt>Nodes</dt>
        <dd>{a} → {b}</dd>
        <dt>Diameter</dt>
        <dd>{fmt(toUm(graph.diameter[edge]))} µm</dd>
        <dt>Length</dt>
        <dd>{fmt(toUm(graph.length[edge]))} µm</dd>
        {depthUm !== null && (
          <>
            <dt>Depth</dt>
            <dd>{fmt(depthUm)} µm{layer > 0 && layerNames[layer - 1] ? ` (${layerNames[layer - 1]})` : ""}</dd>
          </>
        )}
        {base && (
          <>
            <dt>Flow</dt>
            <dd>{fmt(toNlPerMin(Math.abs(base.flow[edge])))} nL/min</dd>
            <dt>Velocity</dt>
            <dd>{fmt((Math.abs(base.flow[edge]) / (Math.PI * (graph.diameter[edge] / 2) ** 2)) * 1e3)} mm/s</dd>
            <dt>Hematocrit</dt>
            <dd>{fmt(base.hematocrit[edge])}</dd>
            <dt>Pressure</dt>
            <dd>{fmt(toMmHg(base.pressure[a]))} → {fmt(toMmHg(base.pressure[b]))} mmHg</dd>
            {Object.entries(run!.summary).map(([label, s]) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd>{pct(s.relative_flow[edge])}</dd>
              </Fragment>
            ))}
          </>
        )}
      </dl>
      <div className="actions">
        {conditions.map((c, i) => (
          <button key={i} className="ghost small" disabled={inCondition[i]} onClick={() => onAddToCondition(i)}>
            {inCondition[i] ? `In ${c.label}` : `Add to ${c.label}`}
          </button>
        ))}
        <button className="ghost small" onClick={() => onAddToCondition("new")}>New condition: dilate this vessel</button>
      </div>
    </div>
  );
}
