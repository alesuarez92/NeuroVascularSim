import type { Graph } from "./api";
import { CLASS_COLORS, CLASS_LABELS, type VesselClass, vesselClass } from "./colors";

export type ViewSettings = {
  widthScale: number;
  hidden: VesselClass[];
  depthUm: [number, number] | null; // null: whole depth
};

export const DEFAULT_VIEW: ViewSettings = { widthScale: 1, hidden: [], depthUm: null };

type Props = { graph: Graph; view: ViewSettings; onChange: (v: ViewSettings) => void };

/** How the network is drawn: vessel width, which classes, which depth slab. */
export function ViewControls({ graph, view, onChange }: Props) {
  const present = (["arterial", "capillary", "venous", "unclassified"] as VesselClass[]).filter((c) =>
    graph.vessel_type.some((t) => vesselClass(t) === c),
  );
  const maxDepth = graph.depth ? Math.ceil(graph.depth.reduce((m, d) => Math.max(m, d), 0) * 1e6) : 0;
  const [lo, hi] = view.depthUm ?? [0, maxDepth];
  const setDepth = (a: number, b: number) =>
    onChange({ ...view, depthUm: a <= 0 && b >= maxDepth ? null : [Math.min(a, b), Math.max(a, b)] });
  return (
    <div className="view-controls">
      <label className="inline compact">
        Width ×{view.widthScale.toFixed(1)}
        <input
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={view.widthScale}
          aria-label="Vessel width magnification"
          onChange={(e) => onChange({ ...view, widthScale: Number(e.target.value) })}
        />
      </label>
      <div className="class-toggles" role="group" aria-label="Show vessel classes">
        {present.map((c) => {
          const on = !view.hidden.includes(c);
          return (
            <label key={c} className="check">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange({ ...view, hidden: on ? [...view.hidden, c] : view.hidden.filter((x) => x !== c) })}
              />
              <span className="swatch" style={{ background: CLASS_COLORS[c] }} />
              {CLASS_LABELS[c]}
            </label>
          );
        })}
      </div>
      {graph.depth && (
        <div className="slab" role="group" aria-label="Depth slab">
          <span>Depth {lo}–{hi} µm</span>
          <input type="range" min={0} max={maxDepth} step={10} value={lo} aria-label="Slab top (µm)"
            onChange={(e) => setDepth(Number(e.target.value), hi)} />
          <input type="range" min={0} max={maxDepth} step={10} value={hi} aria-label="Slab bottom (µm)"
            onChange={(e) => setDepth(lo, Number(e.target.value))} />
        </div>
      )}
      <button className="ghost small" onClick={() => onChange(DEFAULT_VIEW)}>Reset view</button>
    </div>
  );
}
