import { describe, expect, it } from "vitest";
import { formatNumber, isVariable, needsPowerOfTen, parseSymbol, powerOfTen, runs } from "./notation";

describe("parseSymbol", () => {
  it("reads subscripts and superscripts", () => {
    expect(parseSymbol("τ_{ref}")).toEqual([{ text: "τ" }, { sub: [{ text: "ref" }] }]);
    expect(parseSymbol("D_{O₂}")).toEqual([{ text: "D" }, { sub: [{ text: "O₂" }] }]);
    expect(parseSymbol("x^{2}_{i}")).toEqual([{ text: "x" }, { sup: [{ text: "2" }] }, { sub: [{ text: "i" }] }]);
    expect(parseSymbol("n_{AV}/n_{PA}")).toEqual([
      { text: "n" }, { sub: [{ text: "AV" }] }, { text: "/n" }, { sub: [{ text: "PA" }] },
    ]);
  });
  it("leaves plain text alone", () => {
    expect(parseSymbol("CMRO₂")).toEqual([{ text: "CMRO₂" }]);
    expect(parseSymbol("")).toEqual([]);
  });
});

describe("variables", () => {
  it("italicises single letters only", () => {
    expect(runs("/n")).toEqual(["/", "n"]);
    expect(isVariable("n")).toBe(true);
    expect(isVariable("α")).toBe(true);
    expect(isVariable("ref")).toBe(false);
    expect(isVariable("CMRO")).toBe(false);
  });
});

describe("powers of ten", () => {
  it("writes small and large numbers as powers of ten", () => {
    expect(powerOfTen(2.4e-9)).toBe("2.4 × 10⁻⁹");
    expect(powerOfTen(1e-12)).toBe("10⁻¹²");
    expect(powerOfTen(-3.5e6)).toBe("−3.5 × 10⁶");
    expect(powerOfTen(1.27e-15, 4)).toBe("1.27 × 10⁻¹⁵");
  });
  it("keeps ordinary numbers as typed", () => {
    expect(needsPowerOfTen(44)).toBe(false);
    expect(needsPowerOfTen(0)).toBe(false);
    expect(needsPowerOfTen(2.4e-9)).toBe(true);
    expect(formatNumber(0.415)).toBe("0.415");
    expect(formatNumber(2.4e-9)).toBe("2.4 × 10⁻⁹");
  });
});
