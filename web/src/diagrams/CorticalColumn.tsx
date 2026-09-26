import { SvgSymbol } from "../MathSymbol";
import { Figure, Region, type RegionProps } from "./Figure";
import { layerBands } from "./geometry";

// Drawing frame (viewBox units).
const X0 = 70;
const X1 = 262;
const TOP = 50;
const H = 330;
const PA_X = 112;
const AV_X = 222;

// A fixed, jittered capillary lattice between the two trunks.
const MESH = (() => {
  const cols = 5;
  const rows = 13;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5; // deterministic jitter
  const pts: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push([132 + c * 18 + rnd() * 10, TOP + 12 + r * ((H - 44) / (rows - 1)) + rnd() * 10]);
    }
  }
  const lines: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols && (r + c) % 3 !== 2) lines.push([...pts[i], ...pts[i + 1]]);
      if (r + 1 < rows && (r + c) % 2 === 0) lines.push([...pts[i], ...pts[i + cols]]);
    }
  }
  return lines;
})();

type Props = RegionProps & {
  depthUm?: number;
  sizeXUm?: number;
  layers?: number[]; // layers to shade (1-based)
};

/**
 * A cortical column in cross-section: pial surface on top, layers L1-L6 with
 * depth marks, a penetrating arteriole (red) and an ascending venule (blue)
 * joined by a capillary mesh through arteriolar and venular offshoots, the
 * pressures fixed at the tops of the trunks, and the tissue pressure around
 * them. Each part is a region that maps to a group of parameters.
 */
export function CorticalColumn({ depthUm = 1200, sizeXUm, layers = [], highlight, onSelect, onHover }: Props) {
  const bands = layerBands(depthUm, H, TOP);
  const r = { highlight, onSelect, onHover };
  const bottom = TOP + H;
  const paEnd = TOP + H * 0.82;
  const avStart = TOP + H * 0.92;
  return (
    <Figure
      title="Cortical column"
      desc="Schematic of a mouse cortical column: layers L1 to L6 below the pial surface, a penetrating arteriole and an ascending venule connected through a capillary bed; inflow pressure at the arteriole top, outflow pressure at the venule top, tissue pressure around the vessels."
      viewBox="0 0 340 450"
      className="fig-column"
    >
      {/* Tissue and layers */}
      <rect x={X0} y={TOP} width={X1 - X0} height={H} className="f-tissue" />
      {bands.map((b, i) => (
        <g key={b.name}>
          {i > 0 && <line x1={X0} x2={X1} y1={b.y0} y2={b.y0} className="f-layer-line" />}
          {layers.includes(b.index) && <rect x={X0} y={b.y0} width={X1 - X0} height={b.y1 - b.y0} className="f-layer-hl" />}
          <text x={X0 - 8} y={(b.y0 + b.y1) / 2 + 4} className="f-label" textAnchor="end">{b.name}</text>
        </g>
      ))}
      <line x1={X0 - 16} x2={X1 + 12} y1={TOP} y2={TOP} className="f-pia" />
      <text x={167} y={TOP - 4} className="f-tiny" textAnchor="middle">pial surface</text>

      {/* Capillary bed */}
      <Region id="capillary" label="Capillary bed: show its parameters" {...r}>
        <rect x={124} y={TOP + 6} width={86} height={H - 16} rx={6} className="hit" />
        {MESH.map(([a, b, c, d], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={d} className="f-cap" />
        ))}
        <text x={167} y={bottom - 12} className="f-small" textAnchor="middle">capillaries</text>
      </Region>

      {/* Offshoots */}
      <Region id="offshoots" label="Offshoots and connections: show their parameters" {...r}>
        {[0.18, 0.4, 0.62].map((f) => (
          <path key={`a${f}`} d={`M${PA_X} ${TOP + H * f} q 10 -2 18 8`} className="f-art f-off hitline" />
        ))}
        {[0.28, 0.5, 0.74].map((f) => (
          <path key={`v${f}`} d={`M${AV_X} ${TOP + H * f} q -10 -2 -18 8`} className="f-ven f-off hitline" />
        ))}
      </Region>

      {/* Penetrating vessels */}
      <Region id="penetrating" label="Penetrating vessels: show their parameters" {...r}>
        <rect x={PA_X - 12} y={TOP - 18} width={24} height={paEnd - TOP + 22} rx={6} className="hit" />
        <rect x={AV_X - 12} y={TOP - 18} width={24} height={avStart - TOP + 22} rx={6} className="hit" />
        <path d={`M${X0 - 14} ${TOP - 10} H${PA_X}`} className="f-art f-pial" />
        <polygon points={`${PA_X - 4},${TOP - 10} ${PA_X + 4},${TOP - 10} ${PA_X + 1.5},${paEnd} ${PA_X - 1.5},${paEnd}`} className="f-art-fill" />
        <path d={`M${AV_X} ${TOP - 10} H${X1 + 12}`} className="f-ven f-pial" />
        <polygon points={`${AV_X - 5},${TOP - 10} ${AV_X + 5},${TOP - 10} ${AV_X + 2},${avStart} ${AV_X - 2},${avStart}`} className="f-ven-fill" />
        <text x={PA_X - 8} y={TOP + H * 0.3} className="f-label f-art-text" textAnchor="end" transform={`rotate(-90 ${PA_X - 8} ${TOP + H * 0.3})`}>
          penetrating arteriole
        </text>
        <text x={AV_X + 16} y={TOP + H * 0.3} className="f-label f-ven-text" textAnchor="end" transform={`rotate(-90 ${AV_X + 16} ${TOP + H * 0.3})`}>
          ascending venule
        </text>
      </Region>

      {/* Boundary conditions */}
      <Region id="bc" label="Boundary conditions: show pressures" {...r}>
        <rect x={PA_X - 26} y={2} width={52} height={24} rx={5} className="hit" />
        <rect x={AV_X - 26} y={2} width={52} height={24} rx={5} className="hit" />
        <rect x={X0 + 1} y={bottom - 26} width={52} height={22} rx={5} className="hit" />
        <text x={PA_X} y={19} className="f-strong f-art-text" textAnchor="middle"><SvgSymbol symbol="P_{in}" /> ↓</text>
        <text x={AV_X} y={19} className="f-strong f-ven-text" textAnchor="middle"><SvgSymbol symbol="P_{out}" /> ↑</text>
        <text x={X0 + 27} y={bottom - 11} className="f-small" textAnchor="middle">ICP</text>
      </Region>

      {/* Column size: depth ruler and width */}
      <Region id="size" label="Column size: show its parameters" {...r}>
        <rect x={X1 + 4} y={TOP - 6} width={72} height={H + 12} rx={5} className="hit" />
        <rect x={X0} y={bottom + 6} width={X1 - X0} height={26} rx={5} className="hit" />
        <line x1={X1 + 10} x2={X1 + 10} y1={TOP} y2={bottom} className="f-axis" />
        {[...bands.map((b) => ({ y: b.y0, v: b.top })), { y: bottom, v: bands.at(-1)?.bottom ?? depthUm }].map((t) => (
          <g key={t.v}>
            <line x1={X1 + 6} x2={X1 + 14} y1={t.y} y2={t.y} className="f-axis" />
            <text x={X1 + 18} y={t.y + 4} className="f-small">{Math.round(t.v)} µm</text>
          </g>
        ))}
        <line x1={X0} x2={X1} y1={bottom + 16} y2={bottom + 16} className="f-axis f-dim" />
        <text x={(X0 + X1) / 2} y={bottom + 28} className="f-small" textAnchor="middle">
          {sizeXUm ? `${Math.round(sizeXUm)} µm wide` : "column width"}
        </text>
      </Region>

      {/* Structural adaptation */}
      <Region id="adaptation" label="Structural adaptation: show its parameters" {...r}>
        <rect x={X0} y={bottom + 38} width={X1 - X0} height={26} rx={6} className="hit f-callout" />
        <line x1={X0 + 12} x2={X0 + 40} y1={bottom + 51} y2={bottom + 51} className="f-cap f-cap-thin" />
        <line x1={X0 + 46} x2={X0 + 74} y1={bottom + 51} y2={bottom + 51} className="f-cap f-cap-thick" />
        <text x={X0 + 82} y={bottom + 55} className="f-small">structural adaptation</text>
      </Region>
    </Figure>
  );
}
