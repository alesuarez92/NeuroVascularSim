// Scientific notation for people: symbols with sub/superscripts, powers of ten
// instead of "e-9". Pure functions, tested without a browser.

export type SymbolPart = { text: string } | { sub: SymbolPart[] } | { sup: SymbolPart[] };

/** Parse the paramdocs symbol markup: "_{...}" subscript, "^{...}" superscript. */
export function parseSymbol(s: string): SymbolPart[] {
  let i = 0;
  const group = (): SymbolPart[] => {
    const out: SymbolPart[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push({ text });
      text = "";
    };
    while (i < s.length) {
      const c = s[i];
      if (c === "}") {
        i++;
        break;
      }
      if ((c === "_" || c === "^") && s[i + 1] === "{") {
        flush();
        i += 2;
        const inner = group();
        out.push(c === "_" ? { sub: inner } : { sup: inner });
        continue;
      }
      text += c;
      i++;
    }
    flush();
    return out;
  };
  return group();
}

/** A run of letters is a variable (italic) when it is one Latin or Greek letter, as in ISO 80000-2. */
export const isVariable = (run: string) => /^[A-Za-zͰ-Ͽ]$/.test(run);

/** Split text into runs of letters and other characters, e.g. "n/n" -> ["n", "/", "n"]. */
export const runs = (text: string) => text.match(/[A-Za-zͰ-Ͽ]+|[^A-Za-zͰ-Ͽ]+/g) ?? [];

const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

/** True when a number reads better as a power of ten. */
export const needsPowerOfTen = (x: number) => Number.isFinite(x) && x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e5);

/** 2.4e-9 -> "2.4 × 10⁻⁹" (up to ``digits`` significant digits, trailing zeros dropped). */
export function powerOfTen(x: number, digits = 3): string {
  const [mant, exp] = x.toExponential(digits - 1).split("e");
  const m = mant.includes(".") ? mant.replace(/\.?0+$/, "") : mant;
  const e = String(Number(exp)).replace(/./g, (ch) => SUPERSCRIPT[ch] ?? ch);
  return m === "1" ? `10${e}` : m === "-1" ? `−10${e}` : `${m.replace("-", "−")} × 10${e}`;
}

/** A parameter value as text: powers of ten for very small or large numbers, else as given. */
export const formatNumber = (x: number) => (needsPowerOfTen(x) ? powerOfTen(x, 4) : String(x));
