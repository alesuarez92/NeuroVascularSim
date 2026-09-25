import type { Graph, RunRecord } from "./api";
import { fmt, pct, toNlPerMin, toUm } from "./units";

type Props = {
  graph: Graph;
  run: RunRecord | null;
  selected: number | null;
  onSelect: (edge: number | null) => void;
};

/** Every vessel segment as a row: the table view behind the 3D picture. */
export function EdgeTable({ graph, run, selected, onSelect }: Props) {
  const conditions = run ? Object.keys(run.summary) : [];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Edge</th>
            <th>Nodes</th>
            <th>Type</th>
            <th className="num">D (µm)</th>
            <th className="num">L (µm)</th>
            {run && <th className="num">Flow, baseline (nL/min)</th>}
            {run && <th className="num">Hct, baseline</th>}
            {conditions.map((c) => (
              <th key={c} className="num">Flow change: {c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {graph.edges.map(([a, b], k) => (
            <tr
              key={k}
              className={selected === k ? "selected" : undefined}
              onMouseEnter={() => onSelect(k)}
              onMouseLeave={() => onSelect(null)}
            >
              <td className="num">{k}</td>
              <td>{a}→{b}</td>
              <td>{graph.vessel_type[k].toLowerCase().replace(/_/g, " ")}</td>
              <td className="num">{fmt(toUm(graph.diameter[k]))}</td>
              <td className="num">{fmt(toUm(graph.length[k]))}</td>
              {run && <td className="num">{fmt(toNlPerMin(run.results.baseline.flow[k]))}</td>}
              {run && <td className="num">{fmt(run.results.baseline.hematocrit[k])}</td>}
              {conditions.map((c) => (
                <td key={c} className="num">{pct(run!.summary[c].relative_flow[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
