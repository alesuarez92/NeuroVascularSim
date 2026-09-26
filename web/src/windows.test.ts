import { describe, expect, it } from "vitest";
import {
  MIN_H,
  MIN_W,
  WINDOW_IDS,
  adaptLayout,
  bringToFront,
  clampRect,
  closeWindow,
  defaultLayout,
  deserializeLayout,
  displayRect,
  moveWindow,
  openWindow,
  resizeWindow,
  serializeLayout,
  setPoppedOut,
  toggleMaximize,
  toggleMinimize,
  topWindow,
} from "./windows";

const laptop = { w: 1440, h: 850 };
const phone = { w: 400, h: 760 };

describe("default layout", () => {
  it("puts setup left, network large right, results below it, all inside the viewport", () => {
    const l = defaultLayout(laptop);
    expect(l.setup.open && l.network.open && l.results.open).toBe(true);
    expect(l.runs.open).toBe(false);
    expect(l.setup.x).toBeLessThan(l.network.x);
    expect(l.network.w * l.network.h).toBeGreaterThan(l.setup.w * l.setup.h);
    expect(l.results.y).toBeGreaterThan(l.network.y + l.network.h - 1);
    expect(l.results.x).toBe(l.network.x);
    for (const id of WINDOW_IDS) {
      const s = l[id];
      expect(s.x + s.w).toBeLessThanOrEqual(laptop.w);
      expect(s.y + s.h).toBeLessThanOrEqual(laptop.h);
      expect(s.w).toBeGreaterThanOrEqual(MIN_W);
    }
    // No overlap between setup and network.
    expect(l.setup.x + l.setup.w).toBeLessThanOrEqual(l.network.x);
  });

  it("on a narrow screen maximizes every window and shows only the setup", () => {
    const l = defaultLayout(phone);
    expect(WINDOW_IDS.every((id) => l[id].maximized)).toBe(true);
    expect(WINDOW_IDS.filter((id) => l[id].open)).toEqual(["setup"]);
  });
});

describe("layout operations", () => {
  it("brings a window to front with stacking values 0..n-1", () => {
    const l = bringToFront(defaultLayout(laptop), "results");
    expect(topWindow(l)).toBe("results");
    expect(WINDOW_IDS.map((id) => l[id].z).sort()).toEqual([0, 1, 2, 3]);
  });

  it("clamps moves to the viewport", () => {
    let l = defaultLayout(laptop);
    l = moveWindow(l, "network", -500, 5000, laptop);
    expect(l.network.x).toBe(0);
    expect(l.network.y).toBe(laptop.h - l.network.h);
  });

  it("clamps resizes to the minimum size and the space to the right and below", () => {
    let l = defaultLayout(laptop);
    l = resizeWindow(l, "setup", 10, 10, laptop);
    expect(l.setup.w).toBe(MIN_W);
    expect(l.setup.h).toBe(MIN_H);
    l = resizeWindow(l, "setup", 99999, 99999, laptop);
    expect(l.setup.x + l.setup.w).toBeLessThanOrEqual(laptop.w);
    expect(l.setup.y + l.setup.h).toBeLessThanOrEqual(laptop.h);
  });

  it("never makes a window larger than a tiny viewport", () => {
    const r = clampRect({ x: 50, y: 50, w: 500, h: 500 }, { w: 200, h: 120 });
    expect(r).toEqual({ x: 0, y: 0, w: 200, h: 120 });
  });

  it("minimizes and restores, maximizes and restores", () => {
    let l = defaultLayout(laptop);
    l = toggleMinimize(l, "network", laptop);
    expect(l.network.minimized).toBe(true);
    expect(topWindow(l)).not.toBe("network");
    l = toggleMinimize(l, "network", laptop);
    expect(l.network.minimized).toBe(false);
    expect(topWindow(l)).toBe("network");
    l = toggleMaximize(l, "results", laptop);
    expect(l.results.maximized).toBe(true);
    expect(displayRect(l.results, laptop)).toEqual({ x: 0, y: 0, w: laptop.w, h: laptop.h });
    const before = defaultLayout(laptop).results;
    l = toggleMaximize(l, "results", laptop);
    expect(displayRect(l.results, laptop)).toEqual({ x: before.x, y: before.y, w: before.w, h: before.h });
  });

  it("opens, closes and pops out", () => {
    let l = openWindow(defaultLayout(laptop), "runs", laptop);
    expect(l.runs.open).toBe(true);
    expect(topWindow(l)).toBe("runs");
    l = closeWindow(l, "runs");
    expect(l.runs.open).toBe(false);
    l = setPoppedOut(l, "network", true);
    expect(l.network.poppedOut).toBe(true);
    expect(topWindow(l)).not.toBe("network");
    expect(setPoppedOut(l, "network", false).network.poppedOut).toBe(false);
  });

  it("shows one window at a time on a narrow screen", () => {
    let l = defaultLayout(phone);
    l = openWindow(l, "network", phone);
    expect(l.network.maximized).toBe(true);
    expect(l.setup.minimized).toBe(true);
    expect(topWindow(l)).toBe("network");
    // Maximize cannot be undone on a phone.
    expect(toggleMaximize(l, "network", phone).network.maximized).toBe(true);
  });

  it("adapts when the viewport crosses the narrow threshold", () => {
    let l = defaultLayout(laptop);
    l = adaptLayout(l, phone, false);
    expect(WINDOW_IDS.every((id) => l[id].maximized)).toBe(true);
    expect(WINDOW_IDS.filter((id) => l[id].open && !l[id].minimized)).toHaveLength(1);
    l = adaptLayout(l, laptop, true);
    expect(l.network.maximized).toBe(false);
    expect(l.network.open).toBe(true);
    expect(l.network.minimized).toBe(false);
  });
});

describe("serialization", () => {
  it("round-trips a layout", () => {
    let l = defaultLayout(laptop);
    l = moveWindow(l, "results", 300, 200, laptop);
    l = openWindow(l, "runs", laptop);
    expect(deserializeLayout(serializeLayout(l), laptop)).toEqual(l);
  });

  it("brings popped-out windows back in-app and clamps to a smaller viewport", () => {
    const l = setPoppedOut(defaultLayout(laptop), "network", true);
    const small = { w: 1000, h: 600 };
    const back = deserializeLayout(serializeLayout(l), small)!;
    expect(back.network.poppedOut).toBe(false);
    for (const id of WINDOW_IDS) {
      expect(back[id].x + back[id].w).toBeLessThanOrEqual(small.w);
      expect(back[id].y + back[id].h).toBeLessThanOrEqual(small.h);
    }
  });

  it("rejects unusable text and fills malformed windows from the default", () => {
    expect(deserializeLayout(null, laptop)).toBeNull();
    expect(deserializeLayout("{not json", laptop)).toBeNull();
    expect(deserializeLayout(JSON.stringify({ version: 99, windows: {} }), laptop)).toBeNull();
    const l = deserializeLayout(JSON.stringify({ version: 1, windows: { setup: { x: "a", w: 500 } } }), laptop)!;
    const d = defaultLayout(laptop);
    expect(l.setup.x).toBe(d.setup.x);
    expect(l.setup.w).toBe(500);
    expect(l.network.w).toBe(d.network.w);
  });
});
