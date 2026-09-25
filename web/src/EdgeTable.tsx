import type { Graph, RunRecord } from "./api";
import { SEGMENT_LABELS } from "./colors";
import { fmt, pct, toNlPerMin, toUm } from "./units";

type Props = {
  graph: Graph;
  run: RunRecord | null;
  selected: number | null;
  onHover: (edge: number | null) => void;
  onSelect: (edge: number) => void;
};

/** Rows drawn at most; large networks show the first ones plus the selected vessel. */
export const MAX_ROWS = 500;

export function tableRows(nEdges: number, selected: number | null): number[] {
  const rows = Array.from({ length: Math.min(nEdges, MAX_ROWS) }, (_, k) => k);
  if (selected !== null && selected >= MAX_ROWS && selected < nEdges) rows.unshift(selected);
  return rows;
}

/** Vessel segments as rows: the table view behind the 3D picture. */
export function EdgeTable({ graph, run, selected, onHover, onSelect }: Props) {
  const conditions = run ? Object.keys(run.summary) : [];
  const rows = tableRows(graph.n_edges, selected);
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
          {rows.map((k) => {
            const [a, b] = graph.edges[k];
            return (
            <tr
              key={k}
              className={selected === k ? "selected" : undefined}
              onMouseEnter={() => onHover(k)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(k)}
            >
              <td className="num">{k}</td>
              <td>{a}→{b}</td>
              <td>{SEGMENT_LABELS[graph.vessel_type[k]] ?? graph.vessel_type[k]}</td>
              <td className="num">{fmt(toUm(graph.diameter[k]))}</td>
              <td className="num">{fmt(toUm(graph.length[k]))}</td>
              {run && <td className="num">{fmt(toNlPerMin(run.results.baseline.flow[k]))}</td>}
              {run && <td className="num">{fmt(run.results.baseline.hematocrit[k])}</td>}
              {conditions.map((c) => (
                <td key={c} className="num">{pct(run!.summary[c].relative_flow[k])}</td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
      {graph.n_edges > MAX_ROWS && (
        <p className="muted table-note">
          Showing {MAX_ROWS} of {graph.n_edges.toLocaleString("en-US")} vessels; click a vessel in the 3D view to show its row.
        </p>
      )}
    </div>
  );
}
