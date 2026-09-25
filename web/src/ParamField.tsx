import { useEffect, useRef, useState } from "react";
import { api, type DataFile } from "./api";
import { formatList, paramKind, paramLabel, parseList } from "./params";

type Props = {
  name: string;
  value: unknown;
  def: unknown;
  choices?: unknown[];
  dataFiles: DataFile[];
  onChange: (value: unknown) => void;
  onUploaded: () => void;
};

/** One plugin parameter, with the input that fits its type. */
export function ParamField({ name, value, def, choices, dataFiles, onChange, onUploaded }: Props) {
  const kind = paramKind(name, def, choices);
  const v = value === undefined ? def : value;
  const label = paramLabel(name);

  if (kind === "boolean") {
    return (
      <label className="check">
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }
  if (kind === "choice") {
    const opts = choices!;
    return (
      <label className="inline">
        {label}
        <select value={String(opts.findIndex((c) => c === v))} onChange={(e) => onChange(opts[Number(e.target.value)])}>
          {opts.map((c, i) => (
            <option key={i} value={i}>{String(c).replace(/_/g, " ")}</option>
          ))}
        </select>
      </label>
    );
  }
  if (kind === "number") {
    return (
      <label className="inline">
        {label}
        <NumberInput value={v as number} onChange={onChange} />
      </label>
    );
  }
  if (kind === "file") return <FileField label={label} value={String(v)} files={dataFiles} onChange={onChange} onUploaded={onUploaded} />;
  if (kind === "text") {
    return (
      <label className="inline">
        {label}
        <input value={String(v ?? "")} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <label className="inline">
      {label}
      <ListInput value={v} onChange={onChange} />
    </label>
  );
}

/** A number box that keeps what is typed until it parses (e.g. "0." or "-"). */
function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value)); // changed elsewhere, e.g. a new network
  }, [value]);
  return (
    <input
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
}

function ListInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(formatList(value));
  useEffect(() => setText(formatList(value)), [value]);
  return (
    <input
      placeholder="not set (comma-separated values)"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(parseList(text))}
      onKeyDown={(e) => e.key === "Enter" && onChange(parseList(text))}
    />
  );
}

function FileField({ label, value, files, onChange, onUploaded }: {
  label: string;
  value: string;
  files: DataFile[];
  onChange: (v: string) => void;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const names = files.map((f) => f.name);
  return (
    <div className="file-field">
      <label className="inline">
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {!names.includes(value) && <option value={value}>{value} (missing)</option>}
          {names.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
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
