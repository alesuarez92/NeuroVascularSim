import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";
import { MIN_H, MIN_W, type Viewport, type WinState, clampRect, displayRect } from "./windows";

type Props = {
  id: string;
  title: string;
  state: WinState;
  viewport: Viewport;
  active: boolean; // in front of the others
  narrow: boolean;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onPopOut: () => void;
  onPopIn: () => void;
  onClose: () => void;
  children: ReactNode;
};

type Drag = { kind: "move" | "resize"; px: number; py: number; x: number; y: number; w: number; h: number };

/**
 * A window inside the page: drag it by its title bar, resize it from the
 * bottom-right corner, minimize, maximize / restore, pop out into its own
 * browser window, close. While dragging, position is kept locally and
 * committed on release, so the content does not re-render on every move.
 * Arrow keys on the focused title bar move the window (with Shift: resize).
 */
export function FloatingWindow(p: Props) {
  const { state, viewport } = p;
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const rect = live ?? displayRect(state, viewport);

  const start = (kind: Drag["kind"]) => (e: PointerEvent) => {
    if (e.button !== 0 || (state.maximized && kind === "move") || p.narrow) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, px: e.clientX, py: e.clientY, ...displayRect(state, viewport) };
    p.onFocus();
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (d.kind === "move") setLive(clampRect({ x: d.x + dx, y: d.y + dy, w: d.w, h: d.h }, viewport));
    else {
      const w = Math.min(Math.max(d.w + dx, MIN_W), viewport.w - d.x);
      const h = Math.min(Math.max(d.h + dy, MIN_H), viewport.h - d.y);
      setLive({ x: d.x, y: d.y, w, h });
    }
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !live) return setLive(null);
    if (d.kind === "move") p.onMove(live.x, live.y);
    else p.onResize(live.w, live.h);
    setLive(null);
  };
  const onTitleKey = (e: KeyboardEvent) => {
    if (state.maximized || p.narrow) return;
    const step = 16;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.shiftKey) p.onResize(state.w + k[0], state.h + k[1]);
    else p.onMove(state.x + k[0], state.y + k[1]);
  };

  if (!state.open || state.minimized) return null;
  const titleId = `win-${p.id}-title`;
  return (
    <section
      className={`fw${p.active ? " active" : ""}${state.maximized ? " maximized" : ""}${live ? " dragging" : ""}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: 10 + state.z }}
      aria-labelledby={titleId}
      onPointerDownCapture={() => !p.active && p.onFocus()}
    >
      <header
        className="fw-title"
        onPointerDown={start("move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && p.onMaximize()}
        onKeyDown={onTitleKey}
        tabIndex={0}
        aria-label={`${p.title} window. Arrow keys move it, Shift+arrows resize it.`}
      >
        <h2 id={titleId}>{p.title}</h2>
        <div className="fw-buttons">
          <button type="button" aria-label={`Minimize ${p.title}`} title="Minimize" onClick={p.onMinimize}>–</button>
          {!p.narrow && (
            <button type="button" aria-label={state.maximized ? `Restore ${p.title}` : `Maximize ${p.title}`} title={state.maximized ? "Restore" : "Maximize"} onClick={p.onMaximize}>
              {state.maximized ? "❐" : "□"}
            </button>
          )}
          <button type="button" aria-label={`Open ${p.title} in its own browser window`} title="Pop out into its own window" onClick={p.onPopOut}>⇱</button>
          <button type="button" aria-label={`Close ${p.title}`} title="Close" onClick={p.onClose}>✕</button>
        </div>
      </header>
      <div className="fw-body">
        {state.poppedOut ? (
          <div className="popped">
            <p>Opened in its own window.</p>
            <button type="button" className="ghost" onClick={p.onPopIn}>Bring it back here</button>
          </div>
        ) : (
          p.children
        )}
      </div>
      {!state.maximized && !p.narrow && (
        <div
          className="fw-resize"
          role="presentation"
          onPointerDown={start("resize")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </section>
  );
}
