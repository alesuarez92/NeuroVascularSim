import { DIVERGING, SEQUENTIAL } from "./colors";
import { fmt } from "./units";
import type { Legend as LegendSpec } from "./viz";

export function Legend({ legend }: { legend: LegendSpec }) {
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend-title">{legend.title}</div>
      {legend.kind === "categorical" && (
        <ul className="legend-items">
          {legend.items.map((it) => (
            <li key={it.label}>
              <span className="swatch" style={{ background: it.color }} />
              {it.label}
            </li>
          ))}
        </ul>
      )}
      {legend.kind === "diverging" && (
        <>
          <div
            className="ramp"
            style={{ background: `linear-gradient(to right, ${DIVERGING.low}, ${DIVERGING.mid}, ${DIVERGING.high})` }}
          />
          <div className="ramp-ticks">
            <span>−{legend.limit}{legend.unit}</span>
            <span>0</span>
            <span>+{legend.limit}{legend.unit}</span>
          </div>
        </>
      )}
      {legend.kind === "sequential" && (
        <>
          <div className="ramp" style={{ background: `linear-gradient(to right, ${SEQUENTIAL.join(", ")})` }} />
          <div className="ramp-ticks">
            <span>{fmt(legend.min)} {legend.unit}</span>
            <span>{fmt(legend.max)} {legend.unit}</span>
          </div>
        </>
      )}
    </div>
  );
}
