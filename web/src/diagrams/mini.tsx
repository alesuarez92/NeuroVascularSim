import { SvgSymbol } from "../MathSymbol";
// Small live figures for single parameters: each redraws as the value
// changes (a tube for a diameter, a gauge for pressures, a column box for
// the column size...). Geometry comes from geometry.ts.

import type { ReactNode } from "react";
import { Figure } from "./Figure";
import {
  branchPositions,
  cmro2Fill,
  columnBox,
  depthSpan,
  dilation,
  gaugeX,
  hillSaturation,
  layerBands,
  normalCurvePath,
  rbcCount,
  scale,
  scatter,
  trunkCounts,
  tubeWidth,
} from "./geometry";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const W = 200;

export function TubeMini({ diameterUm, maxUm = 30, cls = "art" }: { diameterUm: number; maxUm?: number; cls?: "art" | "cap" | "ven" }) {
  const w = tubeWidth(diameterUm, Math.max(maxUm, diameterUm), 34);
  return (
    <Figure title="Vessel diameter" desc={`A vessel drawn ${diameterUm} µm wide, to scale with a ${maxUm} µm reference.`} viewBox={`0 0 ${W} 52`} className="mini">
      <line x1={10} x2={150} y1={26} y2={26} className={`f-${cls}-tube`} style={{ strokeWidth: w, strokeLinecap: "butt" }} />
      <line x1={160} x2={160} y1={26 - w / 2} y2={26 + w / 2} className="f-axis" />
      <text x={166} y={30} className="f-small">{diameterUm} µm</text>
    </Figure>
  );
}

export function LengthMini({ lengthUm, maxUm = 300 }: { lengthUm: number; maxUm?: number }) {
  const len = scale(lengthUm, 0, Math.max(maxUm, lengthUm), 4, 170);
  return (
    <Figure title="Vessel length" desc={`A vessel ${lengthUm} µm long.`} viewBox={`0 0 ${W} 44`} className="mini">
      <line x1={10} x2={10 + len} y1={18} y2={18} className="f-art-tube" style={{ strokeWidth: 8, strokeLinecap: "butt" }} />
      <text x={10} y={40} className="f-small">{lengthUm} µm</text>
    </Figure>
  );
}

export function DistributionMini({ mean, sd }: { mean: number; sd: number }) {
  const xMax = Math.max(10, mean + 4 * Math.max(sd, 0));
  const w = 180;
  const h = 44;
  const mx = (mean / xMax) * w;
  return (
    <Figure title="Capillary diameter distribution" desc={`Normal distribution with mean ${mean} µm and standard deviation ${sd} µm.`} viewBox={`0 0 ${W} 76`} className="mini">
      <g transform="translate(10 6)">
        <path d={normalCurvePath(mean, sd, xMax, w, h)} className="f-curve" fill="none" />
        <line x1={0} x2={w} y1={h} y2={h} className="f-axis" />
        <line x1={mx} x2={mx} y1={0} y2={h} className="f-marker" />
        <text x={0} y={h + 14} className="f-small">0</text>
        <text x={w} y={h + 14} className="f-small" textAnchor="end">{Math.round(xMax)} µm</text>
        <text x={mx} y={h + 26} className="f-small" textAnchor="middle">mean {mean} ± {sd} µm</text>
      </g>
    </Figure>
  );
}

export function PressureMini({ pin, pout, icp }: { pin: number | null; pout: number | null; icp: number | null }) {
  const max = Math.max(80, (pin ?? 0) * 1.1, (pout ?? 0) * 1.1);
  const w = 180;
  const x = (v: number) => 10 + gaugeX(v, max, w);
  const marks = [
    { v: pin, label: "P_{in}", cls: "f-small f-art-text", y: 14 },
    { v: pout, label: "P_{out}", cls: "f-small f-ven-text", y: 14 },
    { v: icp, label: "P_{t}", cls: "f-small", y: 50 },
  ].filter((m) => m.v !== null) as { v: number; label: string; cls: string; y: number }[];
  return (
    <Figure title="Pressures" desc={`Inflow ${pin ?? "?"} mmHg, outflow ${pout ?? "?"} mmHg, tissue ${icp ?? "?"} mmHg, on a 0 to ${Math.round(max)} mmHg scale.`} viewBox={`0 0 ${W} 70`} className="mini">
      <rect x={10} y={30} width={w} height={10} rx={5} className="f-gauge" />
      {pin !== null && pout !== null && (
        <rect x={Math.min(x(pin), x(pout))} y={30} width={Math.abs(x(pin) - x(pout))} height={10} className="f-gauge-drive" />
      )}
      {marks.map((m) => (
        <g key={m.label}>
          <line x1={x(m.v)} x2={x(m.v)} y1={24} y2={46} className="f-marker" />
          <text x={x(m.v)} y={m.y + 6} className={m.cls} textAnchor="middle"><SvgSymbol symbol={m.label} /> {m.v}</text>
        </g>
      ))}
      <text x={190} y={66} className="f-tiny" textAnchor="end">scale 0–{Math.round(max)} mmHg</text>
    </Figure>
  );
}

export function HematocritMini({ hematocrit }: { hematocrit: number }) {
  const n = rbcCount(hematocrit, 10);
  return (
    <Figure title="Hematocrit" desc={`Red cells fill ${Math.round(hematocrit * 100)}% of the blood volume.`} viewBox={`0 0 ${W} 50`} className="mini">
      <rect x={10} y={10} width={180} height={26} rx={13} className="f-plasma f-wall-rect" />
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i} cx={22 + i * 17} cy={23} rx={6} ry={9} className="f-rbc" />
      ))}
      <text x={100} y={48} className="f-small" textAnchor="middle">{Math.round(hematocrit * 100)}% red cells by volume</text>
    </Figure>
  );
}

/** A column box at its proportions, with layers and optional overlays (layers, a depth range, CMRO₂ shading). */
export function ColumnMini({ sizeXUm, depthUm, layers = [], depthRange, cmro2, title = "Column" }: {
  sizeXUm: number;
  depthUm: number;
  layers?: number[];
  depthRange?: unknown;
  cmro2?: { factor: number; layers: number[]; depthRange?: unknown } | null;
  title?: string;
}) {
  const { w, h } = columnBox(sizeXUm, depthUm, 90, 120);
  const x0 = 34 + (90 - w) / 2;
  const y0 = 8;
  const bands = layerBands(depthUm, h, y0);
  const span = depthSpan(depthRange, depthUm, h, y0);
  const fill = cmro2 ? cmro2Fill(cmro2.factor) : null;
  const cmSpan = cmro2 ? depthSpan(cmro2.depthRange, depthUm, h, y0) : null;
  return (
    <Figure title={title} desc={`A column ${sizeXUm} µm wide and ${depthUm} µm deep with its cortical layers.`} viewBox={`0 0 ${W} 150`} className="mini">
      <rect x={x0} y={y0} width={w} height={h} className="f-tissue f-outline" />
      {bands.map((b) => (
        <g key={b.name}>
          {layers.includes(b.index) && <rect x={x0} y={b.y0} width={w} height={b.y1 - b.y0} className="f-layer-hl" />}
          {fill && (cmro2!.layers.length ? cmro2!.layers.includes(b.index) : !cmSpan) && (
            <rect x={x0} y={b.y0} width={w} height={b.y1 - b.y0} style={{ fill: fill.color, opacity: fill.opacity }} />
          )}
          <line x1={x0} x2={x0 + w} y1={b.y0} y2={b.y0} className="f-layer-line" />
          {b.y1 - b.y0 > 8 && <text x={x0 - 4} y={(b.y0 + b.y1) / 2 + 3} className="f-tiny" textAnchor="end">{b.name}</text>}
        </g>
      ))}
      {fill && cmSpan && <rect x={x0} y={cmSpan.y0} width={w} height={cmSpan.y1 - cmSpan.y0} style={{ fill: fill.color, opacity: fill.opacity }} />}
      {span && <rect x={x0 - 2} y={span.y0} width={w + 4} height={span.y1 - span.y0} className="f-span" />}
      <text x={x0 + w + 6} y={y0 + 8} className="f-tiny">0</text>
      <text x={x0 + w + 6} y={y0 + h} className="f-tiny">{Math.round(depthUm)} µm</text>
      <text x={x0 + w / 2} y={y0 + h + 14} className="f-tiny" textAnchor="middle">{Math.round(sizeXUm)} µm</text>
    </Figure>
  );
}

export function TrunkMini({ n, kind }: { n: number; kind: "pa" | "av" }) {
  const ys = branchPositions(n, 14, 120);
  const cls = kind === "pa" ? "art" : "ven";
  return (
    <Figure title="Branches per trunk" desc={`A penetrating ${kind === "pa" ? "arteriole" : "venule"} with ${ys.length} side branches.`} viewBox={`0 0 ${W} 140`} className="mini">
      <line x1={60} x2={60} y1={8} y2={128} className={`f-${cls}-tube`} style={{ strokeWidth: 6 }} />
      {ys.map((y, i) => (
        <path key={i} d={`M60 ${y} q ${i % 2 ? -18 : 18} 4 ${i % 2 ? -34 : 34} 14`} className={`f-${cls}-tube`} style={{ strokeWidth: 2.5 }} fill="none" />
      ))}
      <text x={110} y={70} className="f-small">{ys.length} branch{ys.length === 1 ? "" : "es"}</text>
    </Figure>
  );
}

export function AdaptationMini({ on }: { on: boolean }) {
  const before = [3, 3, 3, 3, 3];
  const after = [5, 2, 4, 1.5, 3.5];
  const ws = on ? after : before;
  return (
    <Figure title="Structural adaptation" desc={on ? "Capillary diameters adapted to flow: some wider, some narrower." : "Capillary diameters as generated, without adaptation."} viewBox={`0 0 ${W} 70`} className="mini">
      {ws.map((w, i) => (
        <line key={i} x1={14 + i * 36} x2={40 + i * 36} y1={26} y2={26} className="f-cap-tube" style={{ strokeWidth: w * 2 }} />
      ))}
      <text x={100} y={60} className="f-small" textAnchor="middle">{on ? "on: widths follow flow and shear" : "off: widths as generated"}</text>
    </Figure>
  );
}

export function DensityMini({ density, ratio, sx, sy }: { density: number; ratio: number; sx: number; sy: number }) {
  const { pa, av } = trunkCounts(density, ratio, sx, sy);
  const side = 100;
  const k = side / Math.max(sx, sy, 1);
  const w = sx * k;
  const h = sy * k;
  const pts = scatter(pa + av, w, h, 3);
  return (
    <Figure title="Penetrating vessels, top view" desc={`${pa} penetrating arterioles (red) and ${av} ascending venules (blue) in the column's surface.`} viewBox={`0 0 ${W} 124`} className="mini">
      <rect x={10} y={8} width={w} height={h} className="f-tissue f-outline" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={10 + x} cy={8 + y} r={i < pa ? 3.4 : 2.6} className={i < pa ? "f-art-fill" : "f-ven-fill"} />
      ))}
      <text x={120} y={40} className="f-small f-art-text">{pa} arterioles</text>
      <text x={120} y={58} className="f-small f-ven-text">{av} venules</text>
      <text x={120} y={80} className="f-tiny">top view</text>
    </Figure>
  );
}

export function SaturationMini({ po2, p50, n }: { po2: number; p50: number; n: number }) {
  const w = 170;
  const h = 60;
  const pMax = 120;
  const path = Array.from({ length: 41 }, (_, i) => {
    const p = (i / 40) * pMax;
    return `${i ? "L" : "M"}${(20 + (p / pMax) * w).toFixed(1)},${(8 + h - hillSaturation(p, p50, n) * h).toFixed(1)}`;
  }).join(" ");
  const s = hillSaturation(po2, p50, n);
  const x = 20 + scale(po2, 0, pMax, 0, w);
  const y = 8 + h - s * h;
  return (
    <Figure title="Hemoglobin saturation" desc={`Saturation curve with P50 ${p50} mmHg and Hill coefficient ${n}; at ${po2} mmHg saturation is ${Math.round(s * 100)}%.`} viewBox={`0 0 ${W} 90`} className="mini">
      <line x1={20} x2={20 + w} y1={8 + h} y2={8 + h} className="f-axis" />
      <line x1={20} x2={20} y1={8} y2={8 + h} className="f-axis" />
      <path d={path} className="f-curve" fill="none" />
      <circle cx={x} cy={y} r={3.5} className="f-art-fill" />
      <text x={x + 6} y={y + 12} className="f-small">{Math.round(s * 100)}%</text>
      <text x={20} y={84} className="f-tiny">0</text>
      <text x={20 + w} y={84} className="f-tiny" textAnchor="end">{pMax} mmHg</text>
      <text x={16} y={14} className="f-tiny" textAnchor="end">SO₂</text>
    </Figure>
  );
}

export function DecayMini({ te }: { te: number }) {
  const path = Array.from({ length: 21 }, (_, i) => `${i ? "L" : "M"}${(20 + i * 8.5).toFixed(1)},${(64 - 52 * Math.exp(-(i * 5) / 45)).toFixed(1)}`).join(" ");
  const x = 20 + scale(te, 0, 100, 0, 170);
  return (
    <Figure title="Echo time" desc={`The signal is read ${te} ms after excitation (schematic decay).`} viewBox={`0 0 ${W} 84`} className="mini">
      <line x1={20} x2={190} y1={64} y2={64} className="f-axis" />
      <path d={path} className="f-decay" fill="none" />
      <line x1={x} x2={x} y1={8} y2={64} className="f-marker" />
      <text x={x} y={78} className="f-small" textAnchor="middle">TE {te} ms</text>
    </Figure>
  );
}

const CLASS_OF_TYPE: Record<string, "art" | "cap" | "ven"> = {
  PIAL_ARTERY: "art",
  PENETRATING_ARTERIOLE: "art",
  PRECAPILLARY_ARTERIOLE: "art",
  ARTERIOLE: "art",
  CAPILLARY: "cap",
  VENULE: "ven",
  ASCENDING_VENULE: "ven",
  PIAL_VEIN: "ven",
};
const BASE: Record<"art" | "cap" | "ven", number> = { art: 10, cap: 4, ven: 12 };

/** Before / after a diameter change, one row per vessel class selected (or one generic vessel). */
export function DilationMini({ factor, vesselTypes = [] }: { factor: number; vesselTypes?: string[] }) {
  const classes = [...new Set(vesselTypes.map((t) => CLASS_OF_TYPE[t]).filter(Boolean))];
  const rows = classes.length ? classes : (["art"] as const);
  const label = { art: "arterial", cap: "capillary", ven: "venous" };
  return (
    <Figure title="Diameter change" desc={`Selected vessels before and after scaling their diameter by ${factor}.`} viewBox={`0 0 ${W} ${24 + rows.length * 34}`} className="mini">
      <text x={88} y={12} className="f-tiny" textAnchor="middle">before</text>
      <text x={158} y={12} className="f-tiny" textAnchor="middle">after ×{factor}</text>
      {rows.map((c, i) => {
        const { before, after } = dilation(factor, BASE[c], 30);
        const y = 34 + i * 34;
        return (
          <g key={c}>
            <text x={4} y={y + 3} className="f-tiny">{label[c]}</text>
            <line x1={60} x2={116} y1={y} y2={y} className={`f-${c}-tube f-before`} style={{ strokeWidth: before, strokeLinecap: "butt" }} />
            <line x1={130} x2={186} y1={y} y2={y} className={`f-${c}-tube`} style={{ strokeWidth: after, strokeLinecap: "butt" }} />
          </g>
        );
      })}
    </Figure>
  );
}

/**
 * The live figure for one parameter, or null (the step's schematic then
 * highlights the parameter's region instead). `values` are the current
 * values of the parameter's scope (defaults filled in).
 */
export function miniFor(scope: string, name: string, values: Record<string, unknown>): ReactNode | null {
  const v = num(values[name]);
  const n = (k: string) => num(values[k]);
  if (scope.startsWith("network")) {
    if (name.endsWith("diameter_um") && name !== "capillary_diameter_sd_um" && name !== "capillary_diameter_mean_um" && v !== null) {
      return <TubeMini diameterUm={v} cls={name.startsWith("av_") ? "ven" : name.startsWith("adapt") ? "cap" : "art"} />;
    }
    if ((name === "capillary_diameter_mean_um" || name === "capillary_diameter_sd_um") && n("capillary_diameter_mean_um") !== null) {
      return <DistributionMini mean={n("capillary_diameter_mean_um")!} sd={n("capillary_diameter_sd_um") ?? 0} />;
    }
    if (/^l_.*_um$/.test(name) && v !== null) return <LengthMini lengthUm={v} />;
    if (["p_in_mmhg", "p_out_mmhg", "tissue_pressure_mmhg", "p_arterial_mmhg", "p_venous_mmhg"].includes(name)) {
      return <PressureMini pin={n("p_in_mmhg") ?? n("p_arterial_mmhg")} pout={n("p_out_mmhg") ?? n("p_venous_mmhg")} icp={n("tissue_pressure_mmhg")} />;
    }
    if (name === "hematocrit" && v !== null) return <HematocritMini hematocrit={v} />;
    if ((name === "size_x_um" || name === "size_y_um" || name === "depth_um") && n("depth_um") !== null) {
      return <ColumnMini sizeXUm={n(name === "size_y_um" ? "size_y_um" : "size_x_um") ?? 600} depthUm={n("depth_um")!} />;
    }
    if ((name === "pa_branches_per_trunk" || name === "av_branches_per_trunk") && v !== null) {
      return <TrunkMini n={v} kind={name.startsWith("pa") ? "pa" : "av"} />;
    }
    if (name === "structural_adaptation") return <AdaptationMini on={Boolean(values[name])} />;
    if ((name === "pa_density_per_mm2" || name === "av_to_pa_ratio") && n("pa_density_per_mm2") !== null) {
      return <DensityMini density={n("pa_density_per_mm2")!} ratio={n("av_to_pa_ratio") ?? 1} sx={n("size_x_um") ?? 600} sy={n("size_y_um") ?? 600} />;
    }
    return null;
  }
  if (scope === "oxygen") {
    if (["inlet_po2_mmhg", "p50_mmhg", "hill_n"].includes(name) && n("inlet_po2_mmhg") !== null && n("p50_mmhg") !== null && n("hill_n") !== null) {
      return <SaturationMini po2={n("inlet_po2_mmhg")!} p50={n("p50_mmhg")!} n={n("hill_n")!} />;
    }
    return null;
  }
  if (scope === "bold") {
    if (name === "te_ms" && v !== null) return <DecayMini te={v} />;
    return null;
  }
  return null;
}
