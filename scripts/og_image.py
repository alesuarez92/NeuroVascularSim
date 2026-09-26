"""Social preview (Open Graph) image: a simulated microvascular slab coloured by blood PO2.

Writes an SVG (1200 x 630); rasterise it with a headless browser, e.g.
    chromium --headless --screenshot=og.png --window-size=1200,717 og.svg
(headless Chromium's page area is 87 px shorter than the window) and crop to 1200 x 630.
Usage: python scripts/og_image.py out.svg
"""
import sys

import numpy as np

from neurovascularsim import registry
from neurovascularsim.vascular.flow import solve_flow
from neurovascularsim.vascular.oxygen import solve_oxygen

W, H = 1200, 630
# Blood PO2 colour ramp (mmHg -> colour): venous violet to arterial red, bright on a dark background.
RAMP = [(15, (84, 64, 170)), (35, (150, 70, 190)), (55, (220, 70, 120)), (80, (240, 80, 70)), (100, (255, 150, 90))]


def colour(p):
    ps = [r[0] for r in RAMP]
    rgb = [np.interp(p, ps, [r[1][i] for r in RAMP]) for i in range(3)]
    return "#%02x%02x%02x" % tuple(int(round(c)) for c in rgb)


def main(out):
    case = registry.create("network", "mouse_cortex_synthetic", size_x_um=1800, size_y_um=200, depth_um=900,
                           seed=3, structural_adaptation=True)
    g = case.graph
    sol = solve_flow(g, case.pressure_bc, inlet_hematocrit=case.inlet_hematocrit, viscosity="pries_invitro")
    sources = case.meta.get("sources") or None
    po2 = solve_oxygen(g, sol, inlet_nodes=sources).po2
    pos = g.positions * 1e6
    x0, z0 = pos[:, 0].min(), pos[:, 2].min()
    span_x, span_z = np.ptp(pos[:, 0]), np.ptp(pos[:, 2])
    scale = min((W - 40) / span_x, (H - 40) / span_z)
    px = 20 + (pos[:, 0] - x0) * scale
    # Cortical surface at the top of the image.
    depth_up = g.depth is not None and np.corrcoef(pos[:, 2], g.depth)[0, 1] < 0
    pz = (pos[:, 2] - z0) * scale
    pz = 20 + (pz if not depth_up else span_z * scale - pz)
    d_um = g.diameter * 1e6
    order = np.argsort(d_um)  # capillaries first, large vessels on top
    lines = []
    for k in order:
        a, b = g.edges[k]
        cap = d_um[k] < 7
        w = (0.35 if cap else 0.45 if d_um[k] < 12 else 0.8) * d_um[k] * scale
        w = max(0.6, w)
        op = 0.42 if cap else 0.8 if d_um[k] < 12 else 0.95
        lines.append(f'<line x1="{px[a]:.1f}" y1="{pz[a]:.1f}" x2="{px[b]:.1f}" y2="{pz[b]:.1f}" '
                     f'stroke="{colour(po2[k])}" stroke-width="{w:.2f}" stroke-opacity="{op}"/>')
    logo = ('<g transform="translate(64 214) scale(2.6)" fill="none" stroke="#ff5a55" stroke-linecap="round">'
            '<path d="M3 17H12" stroke-width="6"/><path d="M12 17C18 17 19 7 29 6" stroke-width="5"/>'
            '<path d="M12 17C18 17 19 26 29 27" stroke-width="3"/></g>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
  <radialGradient id="bg" cx="70%" cy="40%" r="90%"><stop offset="0" stop-color="#171b2e"/><stop offset="1" stop-color="#07080f"/></radialGradient>
  <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#07080f" stop-opacity="0.93"/><stop offset="0.42" stop-color="#07080f" stop-opacity="0.6"/><stop offset="0.7" stop-color="#07080f" stop-opacity="0"/></linearGradient>
  <filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<g filter="url(#glow)" stroke-linecap="round">{"".join(lines)}</g>
<rect width="{W}" height="{H}" fill="url(#fade)"/>
{logo}
<text x="64" y="340" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="68" font-weight="700" fill="#f4f5fb">NeuroVascularSim</text>
<text x="66" y="392" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="27" fill="#b8bdd6">Blood flow and oxygen in the cortical microcirculation</text>
<text x="66" y="580" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="18" fill="#7d83a3">Simulated mouse cortex · vessels coloured by blood PO2</text>
</svg>'''
    open(out, "w").write(svg)


if __name__ == "__main__":
    main(sys.argv[1])
