import { useEffect, useRef, useState } from "react";
import type { Graph } from "./api";
import { CLASS_COLORS, CLASS_LABELS, type VesselClass, vesselClass } from "./colors";
import { DEFAULT_VIEW, type ViewSettings, viewChangeCount, viewChangeSummary } from "./viewSettings";

export { DEFAULT_VIEW, type ViewSettings } from "./viewSettings";

type Props = { graph: Graph; view: ViewSettings; onChange: (v: ViewSettings) => void };

/**
 * How the network is drawn (vessel width, which classes, which depth slab),
 * behind a small "View ▾" button so the toolbar stays one row and the 3D
 * stage keeps the window's height. A badge counts the settings changed from
 * the default. The panel closes on Escape or a click outside it.
 */
export function ViewControls({ graph, view, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const present = (["arterial", "capillary", "venous", "unclassified"] as VesselClass[]).filter((c) =>
    graph.vessel_type.some((t) => vesselClass(t) === c),
  );
  const maxDepth = graph.depth ? Math.ceil(graph.depth.reduce((m, d) => Math.max(m, d), 0) * 1e6) : 0;
  const [lo, hi] = view.depthUm ?? [0, maxDepth];
  const setDepth = (a: number, b: number) =>
    onChange({ ...view, depthUm: a <= 0 && b >= maxDepth ? null : [Math.min(a, b), Math.max(a, b)] });
  const changes = viewChangeCount(view);
  const summary = viewChangeSummary(view, CLASS_LABELS);
  return (
    <div className="view-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className={`ghost small view-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls="view-panel"
        title={summary ? `View settings changed: ${summary}` : "Vessel width, classes and depth slab"}
        onClick={() => setOpen((o) => !o)}
      >
        View {changes > 0 && <span className="count" aria-label={`(${changes} changed)`}>{changes}</span>} ▾
      </button>
      {open && (
        <div className="view-panel" id="view-panel" role="group" aria-label="View settings">
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
              <span className="slab-title">Depth {lo}–{hi} µm</span>
              <span>Top</span>
              <input type="range" min={0} max={maxDepth} step={10} value={lo} aria-label="Slab top (µm)"
                onChange={(e) => setDepth(Number(e.target.value), hi)} />
              <span>Bottom</span>
              <input type="range" min={0} max={maxDepth} step={10} value={hi} aria-label="Slab bottom (µm)"
                onChange={(e) => setDepth(lo, Number(e.target.value))} />
            </div>
          )}
          <button type="button" className="ghost small" disabled={changes === 0} onClick={() => onChange(DEFAULT_VIEW)}>Reset view</button>
        </div>
      )}
    </div>
  );
}
