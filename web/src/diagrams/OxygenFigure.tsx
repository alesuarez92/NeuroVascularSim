import { Figure, Region, type RegionProps } from "./Figure";
import { hillSaturation } from "./geometry";

type Props = RegionProps & { values?: Record<string, unknown> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Oxygen from blood to tissue: blood enters through an arteriole at the
 * inlet PO₂, gives off oxygen along the capillary and leaves through a
 * venule; oxygen released by hemoglobin diffuses through the wall into the
 * tissue, which consumes it (CMRO₂). Tissue PO₂ is solved on a voxel grid.
 */
export function OxygenFigure({ values = {}, highlight, onSelect, onHover }: Props) {
  const r = { highlight, onSelect, onHover };
  const inlet = num(values.inlet_po2_mmhg);
  const p50 = num(values.p50_mmhg);
  const n = num(values.hill_n);
  const so2 = inlet !== null && p50 !== null && n !== null ? hillSaturation(inlet, p50, n) : null;
  const cmro2 = num(values.cmro2_umol_per_g_min);
  return (
    <Figure
      title="Oxygen transport"
      desc="Blood flows from an arteriole through a capillary to a venule; PO₂ and hemoglobin saturation fall along the way as oxygen diffuses into the tissue, which consumes it."
      viewBox="0 0 340 240"
    >
      <rect x={0} y={96} width={340} height={144} className="f-tissue" />
      <Region id="inlet" label="Inlet blood: show the inlet PO₂" {...r}>
        <rect x={4} y={16} width={100} height={78} rx={6} className="hit" />
        <line x1={10} x2={100} y1={72} y2={72} className="f-art-tube" style={{ strokeWidth: 14 }} />
        <text x={54} y={30} className="f-label f-art-text" textAnchor="middle">arteriole</text>
        <text x={54} y={44} className="f-small" textAnchor="middle">PO₂ {inlet ?? "…"} mmHg</text>
        <text x={54} y={56} className="f-small" textAnchor="middle">SO₂ {so2 === null ? "…" : `${Math.round(so2 * 100)}%`}</text>
      </Region>
      <Region id="hemoglobin" label="Hemoglobin binding: show its parameters" {...r}>
        <rect x={106} y={16} width={128} height={78} rx={6} className="hit" />
        <line x1={100} x2={240} y1={72} y2={72} className="f-cap-tube" />
        {[124, 150, 176, 202].map((x, i) => (
          <g key={x}>
            <ellipse cx={x} cy={72} rx={6} ry={4.5} className="f-rbc" style={{ opacity: 1 - i * 0.18 }} />
          </g>
        ))}
        <text x={170} y={30} className="f-label f-cap-text" textAnchor="middle">capillary</text>
        <text x={170} y={44} className="f-small" textAnchor="middle">hemoglobin releases O₂</text>
      </Region>
      <line x1={240} x2={330} y1={72} y2={72} className="f-ven-tube" style={{ strokeWidth: 14 }} />
      <text x={286} y={30} className="f-label f-ven-text" textAnchor="middle">venule</text>
      <text x={286} y={44} className="f-small" textAnchor="middle">lower PO₂, SO₂</text>

      <Region id="diffusion" label="Transport to tissue: show diffusion parameters" {...r}>
        <rect x={110} y={82} width={124} height={50} rx={6} className="hit" />
        {[130, 170, 210].map((x) => (
          <g key={x}>
            <line x1={x} x2={x} y1={84} y2={120} className="f-o2" markerEnd="url(#o2head)" />
            <text x={x + 5} y={112} className="f-small">O₂</text>
          </g>
        ))}
      </Region>
      <Region id="tissue" label="Tissue consumption: show CMRO₂ and related parameters" {...r}>
        <rect x={20} y={138} width={214} height={96} rx={6} className="hit" />
        {[40, 90, 140, 190].map((x, i) => (
          <rect key={x} x={x} y={150 + (i % 2) * 12} width={34} height={24} rx={10} className="f-cell" />
        ))}
        <text x={126} y={204} className="f-label" textAnchor="middle">tissue consumes O₂ (CMRO₂)</text>
        {cmro2 !== null && <text x={126} y={220} className="f-small" textAnchor="middle">{cmro2} µmol/g/min</text>}
      </Region>
      <Region id="numerics" label="Numerics: show grid and solver settings" {...r}>
        <rect x={246} y={138} width={88} height={96} rx={6} className="hit" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line x1={258 + i * 18} x2={258 + i * 18} y1={150} y2={204} className="f-grid" />
            <line x1={258} x2={312} y1={150 + i * 18} y2={150 + i * 18} className="f-grid" />
          </g>
        ))}
        <text x={290} y={222} className="f-small" textAnchor="middle">tissue voxels</text>
      </Region>
      <defs>
        <marker id="o2head" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="f-o2head" />
        </marker>
      </defs>
    </Figure>
  );
}
