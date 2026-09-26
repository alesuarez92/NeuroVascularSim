import { Figure, Region, type RegionProps } from "./Figure";
import { scale } from "./geometry";

type Props = RegionProps & { values?: Record<string, unknown> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Where the BOLD signal comes from: in a voxel of tissue, vessels carry
 * deoxyhemoglobin, which is paramagnetic and distorts the scanner field
 * around them; spins dephase, and the signal read at the echo time TE is
 * lower where there is more deoxyhemoglobin. The decay curve is schematic.
 */
export function BoldFigure({ values = {}, highlight, onSelect, onHover }: Props) {
  const r = { highlight, onSelect, onHover };
  const te = num(values.te_ms);
  const field = num(values.field_t);
  const teX = te === null ? null : scale(te, 0, 100, 212, 326);
  // A schematic exponential decay from (212, 150) over 0..100 ms.
  const decay = Array.from({ length: 21 }, (_, i) => {
    const t = i * 5;
    return `${i ? "L" : "M"}${(212 + t * 1.14).toFixed(1)},${(150 - 110 * Math.exp(-t / 45)).toFixed(1)}`;
  }).join(" ");
  return (
    <Figure
      title="BOLD signal"
      desc="A voxel with vessels containing deoxyhemoglobin, which distorts the magnetic field around them; the MR signal decays with time and is read at the echo time TE."
      viewBox="0 0 340 200"
    >
      <Region id="field" label="Scanner field: show field strength and relaxation constants" {...r}>
        <rect x={4} y={10} width={30} height={170} rx={5} className="hit" />
        <line x1={18} x2={18} y1={170} y2={24} className="f-arrow f-strong-line" markerEnd="url(#boldhead)" />
        <text x={18} y={188} className="f-small" textAnchor="middle">B0{field !== null ? ` ${field} T` : ""}</text>
      </Region>
      <Region id="slab" label="Voxel: show the slab thickness" {...r}>
        <rect x={40} y={14} width={150} height={160} rx={6} className="hit" />
        <rect x={46} y={20} width={138} height={148} className="f-tissue f-voxel" />
        <text x={115} y={188} className="f-small" textAnchor="middle">voxel (tissue slab)</text>
      </Region>
      <Region id="deoxy" label="Deoxyhemoglobin and susceptibility: show their parameters" {...r}>
        <rect x={62} y={40} width={106} height={108} rx={6} className="hit" />
        {/* Field distortion around a vessel (dipole pattern). */}
        {[18, 28, 38].map((k) => (
          <g key={k} className="f-fieldline">
            <path d={`M${115 - k} 94 C ${115 - k} ${94 - k * 1.3}, ${115 + k} ${94 - k * 1.3}, ${115 + k} 94`} fill="none" />
            <path d={`M${115 - k} 94 C ${115 - k} ${94 + k * 1.3}, ${115 + k} ${94 + k * 1.3}, ${115 + k} 94`} fill="none" />
          </g>
        ))}
        <circle cx={115} cy={94} r={12} className="f-ven-fill" />
        {[[110, 90], [120, 92], [113, 99], [119, 100]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2} className="f-deoxy" />
        ))}
        <circle cx={70} cy={150} r={5} className="f-cap-fill" />
        <circle cx={164} cy={44} r={4} className="f-art-fill" />
        <text x={115} y={36} className="f-small" textAnchor="middle">deoxy-Hb bends the field</text>
      </Region>
      <Region id="te" label="Echo time: show TE" {...r}>
        <rect x={200} y={20} width={134} height={160} rx={6} className="hit" />
        <line x1={212} x2={212} y1={36} y2={150} className="f-axis" />
        <line x1={212} x2={330} y1={150} y2={150} className="f-axis" />
        <path d={decay} className="f-decay" fill="none" />
        {teX !== null && (
          <g>
            <line x1={teX} x2={teX} y1={36} y2={150} className="f-marker" />
            <text x={teX} y={32} className="f-small" textAnchor="middle">TE {te} ms</text>
          </g>
        )}
        <text x={270} y={166} className="f-small" textAnchor="middle">time after excitation</text>
        <text x={216} y={46} className="f-small">signal</text>
      </Region>
      <defs>
        <marker id="boldhead" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="f-arrowhead" />
        </marker>
      </defs>
    </Figure>
  );
}
