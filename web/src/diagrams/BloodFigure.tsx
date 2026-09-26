import { Figure, Region, type RegionProps } from "./Figure";
import { rbcCount } from "./geometry";

type Props = RegionProps & { hematocrit?: number };

const PROFILE = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

// Control points of the fast branch path "M96 188 C 130 188, 140 156, 186 152".
const FAST_BRANCH = [[96, 188], [130, 188], [140, 156], [186, 152]];
const FAST_BRANCH_T = [0.3, 0.6, 0.88];

/** Point and tangent angle (degrees) at ``t`` on the fast branch, so its red cells sit inside the vessel. */
function onFastBranch(t: number) {
  const [p0, p1, p2, p3] = FAST_BRANCH;
  const u = 1 - t;
  const at = (i: 0 | 1) => u ** 3 * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t ** 3 * p3[i];
  const slope = (i: 0 | 1) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  // Cells are drawn upright (ry > rx), i.e. across a horizontal vessel; keep them across the branch.
  return { x: at(0), y: at(1), angle: (Math.atan2(slope(1), slope(0)) * 180) / Math.PI };
}

/**
 * Blood in a microvessel: plasma with a cell-free layer at the wall, red
 * cells in the core (as many as the hematocrit says), a blunted velocity
 * profile; below, red cells splitting unevenly at a branch point (phase
 * separation), and the solver's flow-hematocrit iteration.
 */
export function BloodFigure({ hematocrit = 0.45, highlight, onSelect, onHover }: Props) {
  const r = { highlight, onSelect, onHover };
  const n = rbcCount(hematocrit, 14);
  // Cells packed in the vessel core, alternating slightly up and down.
  const cells = Array.from({ length: n }, (_, i) => ({ x: 128 + (i * 190) / Math.max(n, 1), y: 65 + (i % 2 ? 6 : -6) }));
  return (
    <Figure
      title="Blood in a capillary"
      desc="A vessel with plasma, a cell-free layer near the wall and red blood cells in the core; a blunted velocity profile; below, red cells dividing unevenly between two branches, and the iteration between flow and hematocrit."
      viewBox="0 0 340 250"
    >
      {/* Vessel */}
      <rect x={20} y={28} width={310} height={74} className="f-plasma" />
      <rect x={20} y={34} width={310} height={8} className="f-cellfree" />
      <rect x={20} y={88} width={310} height={8} className="f-cellfree" />
      <line x1={20} x2={330} y1={28} y2={28} className="f-wall" />
      <line x1={20} x2={330} y1={102} y2={102} className="f-wall" />
      <text x={330} y={20} className="f-small" textAnchor="end">vessel wall · cell-free plasma layer</text>

      <Region id="viscosity" label="Viscosity: show the rheology settings" {...r}>
        <rect x={24} y={30} width={84} height={70} rx={5} className="hit" />
        <line x1={40} x2={40} y1={30} y2={100} className="f-axis" />
        {PROFILE.map((t) => {
          const len = 58 * (1 - Math.abs(t) ** 4); // blunted: flat core, steep near the wall
          const y = 65 + t * 32;
          return <line key={t} x1={40} x2={40 + len} y1={y} y2={y} className="f-arrow" markerEnd="url(#arrowhead)" />;
        })}
        <text x={66} y={118} className="f-label" textAnchor="middle">velocity profile</text>
      </Region>

      <Region id="hematocrit" label="Hematocrit: show its setting" {...r}>
        <rect x={116} y={40} width={210} height={50} rx={5} className="hit" />
        {cells.map((c, i) => (
          <ellipse key={i} cx={c.x} cy={c.y} rx={6} ry={9} className="f-rbc" />
        ))}
        <text x={222} y={118} className="f-label" textAnchor="middle">red cells: hematocrit {Math.round(hematocrit * 100)}%</text>
      </Region>

      <Region id="phase" label="Phase separation: show its setting" {...r}>
        <rect x={16} y={134} width={180} height={110} rx={6} className="hit" />
        <path d="M24 188 H96" className="f-art-tube" style={{ strokeWidth: 16 }} />
        <path d="M96 188 C 130 188, 140 156, 186 152" className="f-art-tube" style={{ strokeWidth: 14 }} fill="none" />
        <path d="M96 188 C 130 188, 140 222, 186 226" className="f-art-tube" style={{ strokeWidth: 8 }} fill="none" />
        {[36, 56, 76].map((x) => <ellipse key={x} cx={x} cy={188} rx={4} ry={5} className="f-rbc" />)}
        {FAST_BRANCH_T.map((t) => {
          const { x, y, angle } = onFastBranch(t);
          return <ellipse key={t} cx={x} cy={y} rx={4} ry={5} className="f-rbc" transform={`rotate(${angle} ${x} ${y})`} />;
        })}
        <text x={22} y={150} className="f-small">fast branch: more cells</text>
        <text x={22} y={238} className="f-small">slow branch: fewer</text>
      </Region>

      <Region id="numerics" label="Solver numerics: show tolerance and iterations" {...r}>
        <rect x={210} y={134} width={122} height={110} rx={6} className="hit" />
        <path d="M240 170 A 30 26 0 0 1 300 170" className="f-arrow" markerEnd="url(#arrowhead)" fill="none" />
        <path d="M300 196 A 30 22 0 0 1 240 196" className="f-arrow" markerEnd="url(#arrowhead)" fill="none" />
        <text x={270} y={166} className="f-small" textAnchor="middle">flow</text>
        <text x={270} y={188} className="f-small" textAnchor="middle">hematocrit</text>
        <text x={270} y={236} className="f-small" textAnchor="middle">until change &lt; tol</text>
      </Region>
      <defs>
        <marker id="arrowhead" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="f-arrowhead" />
        </marker>
      </defs>
    </Figure>
  );
}
