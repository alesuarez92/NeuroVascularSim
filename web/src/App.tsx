import { type ReactNode, useEffect, useRef, useState } from "react";
import { FloatingWindow } from "./FloatingWindow";
import { NetworkWindow } from "./NetworkWindow";
import { ResultsWindow, RunsWindow } from "./ResultsWindow";
import { SetupWizard } from "./SetupWizard";
import { type AppState, useAppState } from "./state";
import {
  WINDOW_IDS,
  WINDOW_TITLES,
  type Layout,
  type Viewport,
  type WinId,
  adaptLayout,
  bringToFront,
  closeWindow,
  defaultLayout,
  deserializeLayout,
  isNarrow,
  isWinId,
  moveWindow,
  openWindow,
  resizeWindow,
  serializeLayout,
  setPoppedOut,
  toggleMaximize,
  toggleMinimize,
  topWindow,
} from "./windows";

const DOCK_H = 44;
const LAYOUT_KEY = "neurovascularsim.layout";

// Browser storage may be missing or blocked: the layout then just is not remembered.
function loadLayout(vp: Viewport): Layout {
  try {
    return deserializeLayout(window.localStorage.getItem(LAYOUT_KEY), vp) ?? defaultLayout(vp);
  } catch {
    return defaultLayout(vp);
  }
}
function saveLayout(l: Layout) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, serializeLayout(l));
  } catch {
    // not remembered
  }
}

/** The view a page opened with ?window=<id> shows on its own, or null for the whole desktop. */
function poppedView(): WinId | null {
  try {
    const w = new URLSearchParams(window.location.search).get("window");
    return isWinId(w) ? w : null;
  } catch {
    return null;
  }
}

function content(id: WinId, s: AppState, open: (id: WinId) => void): ReactNode {
  switch (id) {
    case "setup":
      return <SetupWizard s={s} onShowResults={() => open("results")} onShowNetwork={() => open("network")} />;
    case "network":
      return <NetworkWindow s={s} />;
    case "results":
      return <ResultsWindow s={s} onShowNetwork={() => open("network")} />;
    case "runs":
      return <RunsWindow s={s} />;
  }
}

/**
 * The app: a dock listing the windows (Setup, Network, Results, Runs &
 * jobs) over a desktop where they float. A page opened with ?window=<id>
 * shows only that view, kept in step with the main page.
 */
export default function App() {
  const popped = poppedView();
  return popped ? <PoppedView id={popped} /> : <Desktop />;
}

function Desktop() {
  const desk = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<Viewport>(() => ({ w: window.innerWidth, h: Math.max(window.innerHeight - DOCK_H, 200) }));
  const vpRef = useRef(vp);
  const [layout, setLayout] = useState<Layout>(() => loadLayout(vp));
  const popups = useRef<Partial<Record<WinId, Window>>>({});
  const s = useAppState({ onPopIn: (w) => setLayout((l) => setPoppedOut(l, w, false)) });
  const narrow = isNarrow(vp);

  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    const measure = () => {
      const old = vpRef.current;
      const next = { w: el.clientWidth, h: el.clientHeight };
      if (next.w === old.w && next.h === old.h) return;
      vpRef.current = next;
      setVp(next);
      setLayout((l) => adaptLayout(l, next, isNarrow(old)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => saveLayout(layout), [layout]);

  // A popped-out window closed by the user comes back in-app.
  useEffect(() => {
    const t = setInterval(() => {
      for (const id of WINDOW_IDS) {
        const w = popups.current[id];
        if (w && w.closed) {
          delete popups.current[id];
          setLayout((l) => setPoppedOut(l, id, false));
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const open = (id: WinId) => setLayout((l) => openWindow(l, id, vp));
  const popOut = (id: WinId) => {
    const st = layout[id];
    const w = window.open(`?window=${id}`, `neurovascularsim-${id}`, `popup,width=${Math.max(st.w, 640)},height=${Math.max(st.h, 480)}`);
    if (!w) return; // blocked: stay in-app
    popups.current[id] = w;
    setLayout((l) => setPoppedOut(l, id, true));
  };
  const popIn = (id: WinId) => {
    popups.current[id]?.close();
    delete popups.current[id];
    setLayout((l) => setPoppedOut(l, id, false));
  };
  const top = topWindow(layout);

  return (
    <div className="desktop-app">
      <header className="dock">
        <h1>NeuroVascularSim</h1>
        <nav aria-label="Windows" className="dock-buttons">
          {WINDOW_IDS.map((id) => {
            const st = layout[id];
            const showing = st.open && !st.minimized;
            return (
              <button
                key={id}
                type="button"
                className={`dock-btn${showing ? " showing" : ""}${top === id ? " front" : ""}`}
                aria-pressed={showing}
                title={st.poppedOut ? "Opened in its own window" : showing ? "Bring to front" : "Open"}
                onClick={() => (st.poppedOut ? popups.current[id]?.focus() : open(id))}
              >
                {WINDOW_TITLES[id]}
                {st.poppedOut && <span aria-label="(popped out)"> ⇱</span>}
                {id === "runs" && s.jobs.some((j) => j.status === "running" || j.status === "queued") && <span className="dot" aria-label="(jobs running)" />}
              </button>
            );
          })}
        </nav>
        <span className="spacer" />
        {s.error && <span className="error dock-error" role="alert" title={s.error}>{s.error}</span>}
        <button type="button" className="ghost small reset-layout" onClick={() => setLayout(defaultLayout(vp))} title="Put the windows back where they started">
          Reset layout
        </button>
        <span className="muted">{s.version && `engine ${s.version}`}</span>
      </header>
      <div className="desk" ref={desk}>
        {WINDOW_IDS.map((id) => (
          <FloatingWindow
            key={id}
            id={id}
            title={WINDOW_TITLES[id]}
            state={layout[id]}
            viewport={vp}
            narrow={narrow}
            active={top === id}
            onFocus={() => setLayout((l) => bringToFront(l, id))}
            onMove={(x, y) => setLayout((l) => moveWindow(l, id, x, y, vp))}
            onResize={(w, h) => setLayout((l) => resizeWindow(l, id, w, h, vp))}
            onMinimize={() => setLayout((l) => toggleMinimize(l, id, vp))}
            onMaximize={() => setLayout((l) => toggleMaximize(l, id, vp))}
            onPopOut={() => popOut(id)}
            onPopIn={() => popIn(id)}
            onClose={() => (layout[id].poppedOut ? popIn(id) : setLayout((l) => closeWindow(l, id)))}
          >
            {content(id, s, open)}
          </FloatingWindow>
        ))}
        {!WINDOW_IDS.some((id) => layout[id].open && !layout[id].minimized) && (
          <p className="muted center">All windows are closed. Open one from the bar above.</p>
        )}
      </div>
    </div>
  );
}

/** One view in its own browser window, synced with the main page. */
function PoppedView({ id }: { id: WinId }) {
  const s = useAppState();
  const sendPopIn = useRef(s.sendPopIn);
  sendPopIn.current = s.sendPopIn;
  useEffect(() => {
    document.title = `${WINDOW_TITLES[id]} · NeuroVascularSim`;
    const bye = () => sendPopIn.current(id);
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [id]);
  return (
    <div className="desktop-app popped-app">
      <header className="dock">
        <h1>NeuroVascularSim · {WINDOW_TITLES[id]}</h1>
        <span className="spacer" />
        {s.error && <span className="error dock-error" role="alert" title={s.error}>{s.error}</span>}
        <button type="button" className="ghost small" onClick={() => { s.sendPopIn(id); window.close(); }}>
          Return to the main window
        </button>
      </header>
      <main className="popped-body">{content(id, s, () => {})}</main>
    </div>
  );
}
