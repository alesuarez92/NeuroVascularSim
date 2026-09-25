// Editing plugin parameters as text: parsing and formatting for the generic
// parameter form. Pure functions, tested without a browser.

export type ParamKind = "number" | "boolean" | "choice" | "file" | "text" | "list";

/** How to edit a parameter, from its default value, its choices and its name. */
export function paramKind(key: string, def: unknown, choices?: unknown[]): ParamKind {
  if (choices && choices.length) return "choice";
  if (typeof def === "boolean") return "boolean";
  if (typeof def === "number") return "number";
  if (typeof def === "string") return key.endsWith("_file") ? "file" : "text";
  return "list"; // lists, and null for "not set"
}

/** "1, 2.5, x" -> [1, 2.5, "x"]; "" -> null (the parameter is not set). */
export function parseList(text: string): (number | string)[] | null {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts.map((s) => (s !== "" && Number.isFinite(Number(s)) ? Number(s) : s));
}

export const formatList = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/** Parameter names as labels: "pa_density_per_mm2" -> "pa density per mm2". */
export const paramLabel = (key: string) => key.replace(/_/g, " ");
