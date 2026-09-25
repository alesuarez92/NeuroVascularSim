import { useEffect, useRef, useState } from "react";
import { SEQUENTIAL, sequential } from "./colors";
import type { TissueSlice } from "./api";
import { fmt } from "./units";

/** Tissue PO2 in the mid-plane of the column (x across, depth down), with hover readout. */
export function SliceMap({ slice, max = 100 }: { slice: TissueSlice; max?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const rows = slice.po2_mmhg.length;
  const cols = slice.po2_mmhg[0]?.length ?? 0;

  useEffect(() => {
    const c = canvas.current;
    if (!c || !rows || !cols) return;
    c.width = cols;
    c.height = rows;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(cols, rows);
    slice.po2_mmhg.forEach((row, r) =>
      row.forEach((v, k) => {
        const hex = sequential(v / max);
        const i = 4 * (r * cols + k);
        img.data[i] = parseInt(hex.slice(1, 3), 16);
        img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[i + 3] = 255;
      }),
    );
    ctx.putImageData(img, 0, 0);
  }, [slice, rows, cols, max]);

  return (
    <figure className="slice">
      <figcaption><span className="chart-title">Tissue PO2, mid-plane (pia at top)</span></figcaption>
      <div className="slice-wrap">
        <canvas
          ref={canvas}
          aria-label="Tissue PO2 map"
          style={{ aspectRatio: `${cols} / ${rows}` }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const k = Math.min(cols - 1, Math.floor(((e.clientX - r.left) / r.width) * cols));
            const row = Math.min(rows - 1, Math.floor(((e.clientY - r.top) / r.height) * rows));
            const v = slice.po2_mmhg[row]?.[k];
            setTip({
              x: e.clientX - r.left,
              y: e.clientY - r.top,
              text: `${fmt(v)} mmHg · x ${fmt((k + 0.5) * slice.voxel_um)} µm · depth ${fmt((row + 0.5) * slice.voxel_um)} µm`,
            });
          }}
          onPointerLeave={() => setTip(null)}
        />
        {tip && <div className="chart-tip" style={{ left: tip.x + 10, top: tip.y + 10 }}>{tip.text}</div>}
      </div>
      <div className="ramp" style={{ background: `linear-gradient(to right, ${SEQUENTIAL.join(", ")})` }} />
      <div className="ramp-ticks"><span>0 mmHg</span><span>{max} mmHg</span></div>
    </figure>
  );
}
