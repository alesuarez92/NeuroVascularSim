import { Figure, Region, type RegionProps } from "./Figure";
import { tubeWidth } from "./geometry";

type Props = RegionProps & { values?: Record<string, unknown>; activeFactor?: number };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/**
 * The Suarez et al. 2021 test network: a feeding arteriole that splits into
 * two daughter arterioles, one of which can be dilated ("active"). Widths
 * follow the diameters being set; pressures are fixed at the ends.
 */
export function Bifurcation({ values = {}, activeFactor = 1, highlight, onSelect, onHover }: Props) {
  const r = { highlight, onSelect, onHover };
  const dF = num(values.d_feeding_um);
  const dD = num(values.d_daughter_um);
  const maxUm = Math.max(30, (dF || 0) * 1.2, (dD || 0) * activeFactor * 1.2);
  const wF = tubeWidth(dF, maxUm, 30);
  const wD = tubeWidth(dD, maxUm, 30);
  const wA = tubeWidth(dD * activeFactor, maxUm, 30);
  return (
    <Figure
      title="Arteriolar bifurcation"
      desc="A feeding arteriole splits into two daughter arterioles; inflow pressure at the left end, outflow pressure at both right ends. Drawn widths follow the diameters."
      viewBox="0 0 340 200"
    >
      <rect x={0} y={0} width={340} height={200} className="f-tissue" rx={8} />
      <Region id="feeding" label="Feeding arteriole: show its parameters" {...r}>
        <rect x={40} y={80} width={112} height={40} rx={6} className="hit" />
        <line x1={48} y1={100} x2={150} y2={100} className="f-art-tube" style={{ strokeWidth: wF }} />
        <text x={96} y={138} className="f-label" textAnchor="middle">feeding · {Number.isFinite(dF) ? `${dF} µm` : ""}</text>
      </Region>
      <Region id="daughters" label="Daughter arterioles: show their parameters" {...r}>
        <rect x={150} y={24} width={150} height={152} rx={6} className="hit" />
        <path d="M150 100 C 190 100, 200 50, 290 44" className="f-art-tube" style={{ strokeWidth: wA }} fill="none" />
        <path d="M150 100 C 190 100, 200 150, 290 156" className="f-art-tube" style={{ strokeWidth: wD }} fill="none" />
        <text x={226} y={36} className="f-label" textAnchor="middle">active daughter{activeFactor !== 1 ? ` ×${activeFactor}` : ""}</text>
        <text x={226} y={186} className="f-label" textAnchor="middle">daughter · {Number.isFinite(dD) ? `${dD} µm` : ""}</text>
      </Region>
      <Region id="bc" label="Boundary conditions: show pressures" {...r}>
        <rect x={2} y={86} width={40} height={28} rx={5} className="hit" />
        <rect x={294} y={30} width={44} height={28} rx={5} className="hit" />
        <rect x={294} y={142} width={44} height={28} rx={5} className="hit" />
        <text x={22} y={104} className="f-strong f-art-text" textAnchor="middle">p_in</text>
        <text x={316} y={48} className="f-strong" textAnchor="middle">p_out</text>
        <text x={316} y={160} className="f-strong" textAnchor="middle">p_out</text>
      </Region>
    </Figure>
  );
}
