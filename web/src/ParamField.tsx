import { useEffect, useRef, useState } from "react";
import { api, type DataFile, type ParamDoc } from "./api";
import { MathSymbol } from "./MathSymbol";
import { needsPowerOfTen, powerOfTen } from "./notation";
import { formatList, paramKind, paramLabel, parseList } from "./params";

type Props = {
  name: string;
  value: unknown;
  def: unknown;
  choices?: unknown[];
  dataFiles: DataFile[];
  onChange: (value: unknown) => void;
  onUploaded: () => void;
  doc?: ParamDoc; // when documented: its label, symbol and unit instead of the code name
};

/** One plugin parameter, with the input that fits its type. */
export function ParamField({ name, value, def, choices, dataFiles, onChange, onUploaded, doc }: Props) {
  const kind = paramKind(name, def, choices);
  const label = doc ? (
    <span title={name}>
      {doc.label}
      {doc.symbol && <> <MathSymbol symbol={doc.symbol} /></>}
      {doc.unit && <span className="unit"> ({doc.unit})</span>}
    </span>
  ) : (
    paramLabel(name)
  );
  const input = <ParamInput name={name} value={value} def={def} choices={choices} dataFiles={dataFiles} onChange={onChange} onUploaded={onUploaded} />;
  if (kind === "boolean") {
    return (
      <label className="check">
        {input}
        {label}
      </label>
    );
  }
  if (kind === "file") return <div className="file-field"><span className="file-label">{label}</span>{input}</div>;
  return (
    <label className="inline">
      {label}
      {input}
    </label>
  );
}

/** Just the input for a parameter (no label), for forms that lay out labels themselves. */
export function ParamInput({ name, value, def, choices, dataFiles, onChange, onUploaded, id }: Props & { id?: string }) {
  const kind = paramKind(name, def, choices);
  const v = value === undefined ? def : value;
  if (kind === "boolean") {
    return <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (kind === "choice") {
    const opts = choices!;
    return (
      <select id={id} value={String(opts.findIndex((c) => c === v))} onChange={(e) => onChange(opts[Number(e.target.value)])}>
        {opts.map((c, i) => (
          <option key={i} value={i}>{String(c).replace(/_/g, " ")}</option>
        ))}
      </select>
    );
  }
  if (kind === "number") return <NumberInput id={id} value={v as number} onChange={onChange} />;
  if (kind === "file") return <FileField id={id} value={String(v)} files={dataFiles} onChange={onChange} onUploaded={onUploaded} />;
  if (kind === "text") return <input id={id} value={String(v ?? "")} onChange={(e) => onChange(e.target.value)} />;
  return <ListInput id={id} value={v} onChange={onChange} />;
}

/** A number box that keeps what is typed until it parses (e.g. "0." or "-"). */
function NumberInput({ id, value, onChange }: { id?: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value)); // changed elsewhere, e.g. a new network
  }, [value]);
  const input = (
    <input
      id={id}
      type="number"
      step="any"
      value={text}
      onFocus={() => (editing.current = true)}
      onBlur={() => {
        editing.current = false;
        setText(String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const x = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(x)) onChange(x);
      }}
    />
  );
  if (!needsPowerOfTen(value)) return input;
  return (
    <span className="number-with-reading">
      {input}
      <span className="power-reading" aria-hidden="true">= {powerOfTen(value, 4)}</span>
    </span>
  );
}

function ListInput({ id, value, onChange }: { id?: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(formatList(value));
  useEffect(() => setText(formatList(value)), [value]);
  return (
    <input
      id={id}
      placeholder="not set (comma-separated values)"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(parseList(text))}
      onKeyDown={(e) => e.key === "Enter" && onChange(parseList(text))}
    />
  );
}

function FileField({ id, value, files, onChange, onUploaded }: {
  id?: string;
  value: string;
  files: DataFile[];
  onChange: (v: string) => void;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const names = files.map((f) => f.name);
  return (
    <div className="file-input">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {!names.includes(value) && <option value={value}>{value} (missing)</option>}
        {names.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <div className="row">
        <button className="ghost" onClick={() => input.current?.click()}>Upload CSV…</button>
        {status && <span className="hint">{status}</span>}
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setStatus(`Uploading ${file.name}…`);
          try {
            const up = await api.uploadDataFile(file);
            setStatus(`Stored ${up.name} in the data directory (never committed).`);
            onUploaded();
            onChange(up.name);
          } catch (err) {
            setStatus(err instanceof Error ? err.message : String(err));
          }
        }}
      />
    </div>
  );
}
