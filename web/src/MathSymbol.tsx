import { type ReactNode } from "react";
import { isVariable, parseSymbol, runs, type SymbolPart } from "./notation";

function render(parts: SymbolPart[], key = ""): ReactNode[] {
  return parts.map((p, i) => {
    const k = `${key}${i}`;
    if ("sub" in p) return <sub key={k}>{render(p.sub, `${k}.`)}</sub>;
    if ("sup" in p) return <sup key={k}>{render(p.sup, `${k}.`)}</sup>;
    return runs(p.text).map((r, j) => (isVariable(r) ? <i key={`${k}-${j}`}>{r}</i> : <span key={`${k}-${j}`}>{r}</span>));
  });
}

/** A parameter's mathematical symbol, e.g. "τ_{ref}" as τ with subscript "ref". */
export function MathSymbol({ symbol }: { symbol: string }) {
  if (!symbol) return null;
  return <span className="math-symbol">{render(parseSymbol(symbol))}</span>;
}

function renderSvg(parts: SymbolPart[], key = ""): ReactNode[] {
  return parts.flatMap((p, i) => {
    const k = `${key}${i}`;
    if ("sub" in p || "sup" in p) {
      const inner = "sub" in p ? p.sub : p.sup;
      const dy = "sub" in p ? 0.3 : -0.45;
      // Shift into the script, then back to the baseline so following text lines up.
      return [
        <tspan key={`${k}a`} dy={`${dy}em`} fontSize="72%">{renderSvg(inner, `${k}.`)}</tspan>,
        <tspan key={`${k}b`} dy={`${-dy * 0.72}em`}>{"\u200b"}</tspan>,
      ];
    }
    return runs(p.text).map((r, j) => (
      <tspan key={`${k}-${j}`} fontStyle={isVariable(r) ? "italic" : undefined}>{r}</tspan>
    ));
  });
}

/** The same symbol inside an SVG <text> (tspans with shifted baselines). */
export function SvgSymbol({ symbol }: { symbol: string }) {
  return <>{renderSvg(parseSymbol(symbol))}</>;
}
