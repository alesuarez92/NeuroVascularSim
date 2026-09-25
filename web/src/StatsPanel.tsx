import { useState } from "react";
import { api, type Component } from "./api";
import { type StatRow, statRows, verdict } from "./stats";
import { fmt } from "./units";

const MARK = { in: "✓ in range", near: "≈ close", out: "✗ outside", none: "" };

/** Morphometry of the current network against published measurements. */
export function StatsPanel({ network }: { network: Component }) {
  const [rows, setRows] = useState<StatRow[] | null>(null);
  const [forKey, setForKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(network);

  async function compute() {
    setBusy(true);
    try {
      setRows(statRows(await api.networkStats(network.name, network.params)));
      setForKey(key);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const stale = rows && forKey !== key;
  return (
    <div className="stats">
      <button className="ghost" onClick={compute} disabled={busy}>
        {busy ? "Computing…" : rows ? "Recompute statistics" : "Compute statistics"}
      </button>
      {stale && <p className="hint">Parameters changed since these were computed.</p>}
      {error && <p className="error">{error}</p>}
      {rows && (
        <table className="stats-table">
          <thead>
            <tr>
              <th>Quantity</th>
              <th className="num">Network</th>
              <th className="num">Measured</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = verdict(r);
              return (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{r.value == null ? "—" : Number.isInteger(r.value) ? r.value.toLocaleString("en-US") : fmt(r.value)} {r.unit}</td>
                  <td className="num" title={r.target?.source}>
                    {r.target ? `${r.target.text} ${r.unit}` : ""}
                  </td>
                  <td className={`verdict ${v}`}>{MARK[v]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows && <p className="hint">Sources: hover a measured value; details in docs/networks.md.</p>}
    </div>
  );
}
