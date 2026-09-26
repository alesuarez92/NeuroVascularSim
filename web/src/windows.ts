// In-app windows: position, size, stacking and state of each floating
// window. Pure functions over plain data, tested without a browser; the
// React side (FloatingWindow, App) only renders a Layout and calls these.

export const WINDOW_IDS = ["setup", "network", "results", "runs"] as const;
export type WinId = (typeof WINDOW_IDS)[number];

export const WINDOW_TITLES: Record<WinId, string> = {
  setup: "Setup",
  network: "Network",
  results: "Results",
  runs: "Runs & jobs",
};

export type WinState = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number; // stacking order: higher is in front
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  poppedOut: boolean; // shown in its own browser window instead
};

export type Layout = Record<WinId, WinState>;
export type Viewport = { w: number; h: number }; // the desktop area, below the dock

export const MIN_W = 280;
export const MIN_H = 160;
export const NARROW_PX = 900;
const GAP = 8;

export const isNarrow = (vp: Viewport) => vp.w < NARROW_PX;
export const isWinId = (s: unknown): s is WinId => typeof s === "string" && (WINDOW_IDS as readonly string[]).includes(s);

type Rect = { x: number; y: number; w: number; h: number };

/** Keep a window inside the viewport and at least the minimum size (smaller viewports win). */
export function clampRect(r: Rect, vp: Viewport): Rect {
  const w = Math.round(Math.min(Math.max(r.w, MIN_W), Math.max(vp.w, 1)));
  const h = Math.round(Math.min(Math.max(r.h, MIN_H), Math.max(vp.h, 1)));
  const x = Math.round(Math.min(Math.max(r.x, 0), Math.max(vp.w - w, 0)));
  const y = Math.round(Math.min(Math.max(r.y, 0), Math.max(vp.h - h, 0)));
  return { x, y, w, h };
}

const win = (r: Rect, z: number, open: boolean, vp: Viewport, maximized = false): WinState => ({
  ...clampRect(r, vp),
  z,
  open,
  minimized: false,
  maximized,
  poppedOut: false,
});

/**
 * The starting arrangement: the setup wizard on the left, the network large
 * on the right, results below it; runs & jobs closed. On a narrow screen
 * every window is maximized and only the setup is open.
 */
export function defaultLayout(vp: Viewport): Layout {
  if (isNarrow(vp)) {
    const full = { x: 0, y: 0, w: vp.w, h: vp.h };
    return {
      setup: win(full, 4, true, vp, true),
      network: win(full, 3, false, vp, true),
      results: win(full, 2, false, vp, true),
      runs: win(full, 1, false, vp, true),
    };
  }
  const leftW = Math.round(Math.min(Math.max(vp.w * 0.34, 380), 520));
  const rightX = leftW + 2 * GAP;
  const rightW = vp.w - rightX - GAP;
  const fullH = vp.h - 2 * GAP;
  const netH = Math.round(fullH * 0.6);
  return {
    setup: win({ x: GAP, y: GAP, w: leftW, h: fullH }, 3, true, vp),
    network: win({ x: rightX, y: GAP, w: rightW, h: netH }, 2, true, vp),
    results: win({ x: rightX, y: GAP * 2 + netH, w: rightW, h: fullH - netH - GAP }, 1, true, vp),
    runs: win({ x: vp.w - 380 - GAP * 3, y: GAP * 4, w: 380, h: Math.min(460, fullH) }, 0, false, vp),
  };
}

const update = (l: Layout, id: WinId, patch: Partial<WinState>): Layout => ({ ...l, [id]: { ...l[id], ...patch } });

/** Put a window in front of the others; stacking values stay 0..n-1. */
export function bringToFront(l: Layout, id: WinId): Layout {
  const order = WINDOW_IDS.filter((w) => w !== id).sort((a, b) => l[a].z - l[b].z);
  order.push(id);
  const out = { ...l };
  order.forEach((w, i) => {
    if (out[w].z !== i) out[w] = { ...out[w], z: i };
  });
  return out;
}

export const topWindow = (l: Layout): WinId | null =>
  WINDOW_IDS.filter((w) => l[w].open && !l[w].minimized && !l[w].poppedOut).sort((a, b) => l[b].z - l[a].z)[0] ?? null;

export function moveWindow(l: Layout, id: WinId, x: number, y: number, vp: Viewport): Layout {
  const r = clampRect({ ...l[id], x, y }, vp);
  return update(l, id, { x: r.x, y: r.y });
}

/** Resize from the bottom-right corner: the top-left corner stays put. */
export function resizeWindow(l: Layout, id: WinId, w: number, h: number, vp: Viewport): Layout {
  const s = l[id];
  const cw = Math.round(Math.min(Math.max(w, MIN_W), Math.max(vp.w - s.x, MIN_W)));
  const ch = Math.round(Math.min(Math.max(h, MIN_H), Math.max(vp.h - s.y, MIN_H)));
  return update(l, id, { ...clampRect({ x: s.x, y: s.y, w: cw, h: ch }, vp) });
}

/** Show a window (restoring it if minimized) in front. Narrow screens show one window at a time. */
export function openWindow(l: Layout, id: WinId, vp: Viewport): Layout {
  let out = update(l, id, { open: true, minimized: false });
  if (isNarrow(vp)) {
    out = update(out, id, { maximized: true });
    for (const w of WINDOW_IDS) if (w !== id && out[w].open) out = update(out, w, { minimized: true });
  }
  return bringToFront(out, id);
}

export const closeWindow = (l: Layout, id: WinId): Layout => update(l, id, { open: false, minimized: false });

export function toggleMinimize(l: Layout, id: WinId, vp: Viewport): Layout {
  return l[id].minimized ? openWindow(l, id, vp) : update(l, id, { minimized: true });
}

/** Maximize or restore. On narrow screens windows stay maximized. */
export function toggleMaximize(l: Layout, id: WinId, vp: Viewport): Layout {
  if (isNarrow(vp)) return bringToFront(update(l, id, { maximized: true, minimized: false }), id);
  return bringToFront(update(l, id, { maximized: !l[id].maximized, minimized: false }), id);
}

export const setPoppedOut = (l: Layout, id: WinId, poppedOut: boolean): Layout =>
  update(l, id, poppedOut ? { poppedOut, open: true } : { poppedOut });

/** The rectangle a window is drawn in (maximized windows fill the viewport). */
export function displayRect(s: WinState, vp: Viewport): Rect {
  if (s.maximized) return { x: 0, y: 0, w: vp.w, h: vp.h };
  return clampRect(s, vp);
}

/** After the browser window changed size: keep every window reachable. */
export function fitLayout(l: Layout, vp: Viewport): Layout {
  const out = { ...l };
  for (const id of WINDOW_IDS) {
    const r = clampRect(l[id], vp);
    const s = l[id];
    if (r.x !== s.x || r.y !== s.y || r.w !== s.w || r.h !== s.h) out[id] = { ...s, ...r };
  }
  return out;
}

const VERSION = 1;

export const serializeLayout = (l: Layout): string => JSON.stringify({ version: VERSION, windows: l });

/**
 * A stored layout, validated field by field; anything missing or malformed
 * comes from the default layout. Popped-out windows come back in-app (their
 * browser windows do not survive a reload). Null if the text is unusable.
 */
export function deserializeLayout(text: string | null, vp: Viewport): Layout | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const d = data as { version?: unknown; windows?: Record<string, unknown> };
  if (!d || d.version !== VERSION || typeof d.windows !== "object" || d.windows === null) return null;
  const base = defaultLayout(vp);
  const out = { ...base };
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
  for (const id of WINDOW_IDS) {
    const s = d.windows[id] as Partial<Record<keyof WinState, unknown>> | undefined;
    if (!s || typeof s !== "object") continue;
    const b = base[id];
    const r = clampRect({ x: num(s.x, b.x), y: num(s.y, b.y), w: num(s.w, b.w), h: num(s.h, b.h) }, vp);
    out[id] = {
      ...r,
      z: num(s.z, b.z),
      open: bool(s.open, b.open),
      minimized: bool(s.minimized, b.minimized),
      maximized: isNarrow(vp) ? true : bool(s.maximized, b.maximized),
      poppedOut: false,
    };
  }
  return bringToFront(out, topWindow(out) ?? "setup");
}

/**
 * After the viewport changed: keep windows inside it; entering a narrow
 * screen maximizes every window and keeps only the front one showing;
 * leaving it returns to the default arrangement of the windows that are open.
 */
export function adaptLayout(l: Layout, vp: Viewport, wasNarrow: boolean): Layout {
  const narrow = isNarrow(vp);
  if (narrow && !wasNarrow) {
    const top = topWindow(l);
    const out = { ...l };
    for (const id of WINDOW_IDS) {
      out[id] = { ...l[id], maximized: true, minimized: l[id].open && id !== top ? true : l[id].minimized };
    }
    return fitLayout(out, vp);
  }
  if (!narrow && wasNarrow) {
    const base = defaultLayout(vp);
    const out = { ...base };
    for (const id of WINDOW_IDS) out[id] = { ...base[id], open: l[id].open, minimized: false, poppedOut: l[id].poppedOut, z: l[id].z };
    return out;
  }
  return fitLayout(l, vp);
}
