// How the network is drawn (vessel width, hidden classes, depth slab): the
// settings and the pure logic around them, shared by the view controls and
// the network window's compact toolbar.

import type { VesselClass } from "./colors";

export type ViewSettings = {
  widthScale: number;
  hidden: VesselClass[];
  depthUm: [number, number] | null; // null: whole depth
};

export const DEFAULT_VIEW: ViewSettings = { widthScale: 1, hidden: [], depthUm: null };

/**
 * How many settings differ from the default (width, each hidden class, the
 * depth slab): shown next to the collapsed "View" button so a filtered
 * network is never mistaken for the whole one.
 */
export function viewChangeCount(v: ViewSettings): number {
  return (v.widthScale !== DEFAULT_VIEW.widthScale ? 1 : 0) + v.hidden.length + (v.depthUm ? 1 : 0);
}

/** A one-line description of the changes, for the button's tooltip ("" when none). */
export function viewChangeSummary(v: ViewSettings, classLabels: Record<VesselClass, string>): string {
  const parts: string[] = [];
  if (v.widthScale !== DEFAULT_VIEW.widthScale) parts.push(`width ×${v.widthScale.toFixed(1)}`);
  if (v.hidden.length) parts.push(`hidden: ${v.hidden.map((c) => classLabels[c].toLowerCase()).join(", ")}`);
  if (v.depthUm) parts.push(`depth ${v.depthUm[0]}–${v.depthUm[1]} µm`);
  return parts.join(" · ");
}
