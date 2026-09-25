import { useMemo, useRef, useState } from "react";
import { fmt } from "./units";

export type Series = { label: string; color: string; values: number[]; dashed?: boolean };

type Props = {
  title: string;
  unit: string;
  depth: number[]; // um, one per value
  series: Series[];
  zeroLine?: boolean;
};

const W = 340;
const H = 300;
const M = { top: 12, right: 14, bottom: 34, left: 48 };

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/**
 * A laminar profile: value across, cortical depth down (pia at the top), one
 * line per series. Hover snaps to the nearest depth and lists every series;
 * a table view carries the same numbers.
 */
export function ProfileChart({ title, unit, depth, series, zeroLine }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const { x, y, xticks, yticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter(Number.isFinite);
    let lo = Math.min(...all, zeroLine ? 0 : Infinity);
    let hi = Math.max(...all, zeroLine ? 0 : -Infinity);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
    if (hi - lo < 1e-9) [lo, hi] = [lo - 1, hi + 1];
    const pad = 0.05 * (hi - lo);
    const xt = niceTicks(lo - pad, hi + pad);
    const x0 = Math.min(lo - pad, xt[0]);
    const x1 = Math.max(hi + pad, xt[xt.length - 1]);
    const dmax = Math.max(...depth, 1);
    return {
      x: (v: number) => M.left + ((v - x0) / (x1 - x0)) * (W - M.left - M.right),
      y: (d: number) => M.top + (d / dmax) * (H - M.top - M.bottom),
      xticks: xt,
      yticks: niceTicks(0, dmax, 5),
    };
  }, [series, depth, zeroLine]);

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const py = ((e.clientY - r.top) / r.height) * H;
    let best = 0;
    depth.forEach((d, i) => {
      if (Math.abs(y(d) - py) < Math.abs(y(depth[best]) - py)) best = i;
    });
    setHover(best);
  };

  return (
    <figure className="profile">
      <figcaption>
        <span className="chart-title">{title}</span>
        <button className="ghost small" onClick={() => setTable(!table)}>{table ? "Chart" : "Table"}</button>
      </figcaption>
      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.label}>
            <svg width="18" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      {table ? (
        <div className="profile-table">
          <table>
            <thead>
              <tr>
                <th className="num">Depth (µm)</th>
                {series.map((s) => <th key={s.label} className="num">{s.label} ({unit})</th>)}
              </tr>
            </thead>
            <tbody>
              {depth.map((d, i) => (
                <tr key={d}>
                  <td className="num">{fmt(d)}</td>
                  {series.map((s) => <td key={s.label} className="num">{fmt(s.values[i])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="profile-plot">
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {xticks.map((t) => (
              <g key={`x${t}`}>
                <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} className="grid" />
                <text x={x(t)} y={H - M.bottom + 14} className="tick" textAnchor="middle">{fmt(t)}</text>
              </g>
            ))}
            {yticks.map((t) => (
              <g key={`y${t}`}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="grid" />
                <text x={M.left - 6} y={y(t) + 4} className="tick" textAnchor="end">{fmt(t)}</text>
              </g>
            ))}
            {zeroLine && <line x1={x(0)} x2={x(0)} y1={M.top} y2={H - M.bottom} className="axis" />}
            <text x={(M.left + W - M.right) / 2} y={H - 4} className="axis-label" textAnchor="middle">{unit}</text>
            <text x={12} y={(M.top + H - M.bottom) / 2} className="axis-label" textAnchor="middle"
              transform={`rotate(-90 12 ${(M.top + H - M.bottom) / 2})`}>Depth (µm)</text>
            {series.map((s) => (
              <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
                strokeDasharray={s.dashed ? "4 3" : undefined}
                points={s.values.map((v, i) => (Number.isFinite(v) ? `${x(v)},${y(depth[i])}` : "")).filter(Boolean).join(" ")} />
            ))}
            {hover !== null && (
              <g>
                <line x1={M.left} x2={W - M.right} y1={y(depth[hover])} y2={y(depth[hover])} className="crosshair" />
                {series.map((s) => Number.isFinite(s.values[hover]) && (
                  <circle key={s.label} cx={x(s.values[hover])} cy={y(depth[hover])} r={4} fill={s.color} stroke="#fcfcfb" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div className="chart-tip" style={{ top: `${(y(depth[hover]) / H) * 100}%` }}>
              <div className="muted">{fmt(depth[hover])} µm</div>
              {series.map((s) => (
                <div key={s.label}>
                  <strong>{fmt(s.values[hover])}</strong> {unit} · {s.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
