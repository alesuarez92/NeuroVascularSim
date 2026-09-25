import { describe, expect, it } from "vitest";
import { DIVERGING, SEQUENTIAL, diverging, mix, sequential, symmetricLimit, vesselClass } from "./colors";
import { pct, toNlPerMin, toUm } from "./units";

describe("colour scales", () => {
  it("diverging is gray at zero and the poles at the limits", () => {
    expect(diverging(0, 10)).toBe(DIVERGING.mid);
    expect(diverging(-10, 10)).toBe(DIVERGING.low);
    expect(diverging(10, 10)).toBe(DIVERGING.high);
    expect(diverging(50, 10)).toBe(DIVERGING.high); // clamped
    expect(diverging(Number.NaN, 10)).toBe(DIVERGING.mid);
  });

  it("sequential spans the ramp", () => {
    expect(sequential(0)).toBe(SEQUENTIAL[0]);
    expect(sequential(1)).toBe(SEQUENTIAL[SEQUENTIAL.length - 1]);
    expect(sequential(2)).toBe(SEQUENTIAL[SEQUENTIAL.length - 1]);
  });

  it("mix interpolates", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("symmetric limit is a readable round number", () => {
    expect(symmetricLimit([-4.2, 13.2])).toBe(15);
    expect(symmetricLimit([0.1])).toBe(1);
  });

  it("maps vessel types to classes", () => {
    expect(vesselClass("PENETRATING_ARTERIOLE")).toBe("arterial");
    expect(vesselClass("CAPILLARY")).toBe("capillary");
    expect(vesselClass("ASCENDING_VENULE")).toBe("venous");
    expect(() => vesselClass("UNKNOWN")).toThrow();
  });
});

describe("units", () => {
  it("converts", () => {
    expect(toUm(1e-5)).toBeCloseTo(10);
    expect(toNlPerMin(1e-12 / 60)).toBeCloseTo(1);
    expect(pct(1.132)).toBe("+13.2%");
    expect(pct(0.958)).toBe("-4.2%");
  });
});
