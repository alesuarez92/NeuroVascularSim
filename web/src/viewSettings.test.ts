import { describe, expect, it } from "vitest";
import { CLASS_LABELS } from "./colors";
import { DEFAULT_VIEW, viewChangeCount, viewChangeSummary } from "./viewSettings";

describe("view settings summary", () => {
  it("counts nothing for the default view", () => {
    expect(viewChangeCount(DEFAULT_VIEW)).toBe(0);
    expect(viewChangeSummary(DEFAULT_VIEW, CLASS_LABELS)).toBe("");
  });

  it("counts width, each hidden class and the depth slab", () => {
    const v = { widthScale: 2.5, hidden: ["capillary", "venous"] as const, depthUm: [100, 400] as [number, number] };
    const view = { ...v, hidden: [...v.hidden] };
    expect(viewChangeCount(view)).toBe(4);
    const text = viewChangeSummary(view, CLASS_LABELS);
    expect(text).toContain("width ×2.5");
    expect(text).toContain(CLASS_LABELS.capillary.toLowerCase());
    expect(text).toContain("depth 100–400 µm");
  });

  it("counts only what changed", () => {
    expect(viewChangeCount({ ...DEFAULT_VIEW, depthUm: [0, 200] })).toBe(1);
    expect(viewChangeCount({ ...DEFAULT_VIEW, hidden: ["arterial"] })).toBe(1);
  });
});
