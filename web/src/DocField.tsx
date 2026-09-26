import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DataFile, ParamDoc } from "./api";
import { MathSymbol } from "./MathSymbol";
import { ParamInput } from "./ParamField";
import { type Field, firstSentence, formatValue, isChanged, linkify } from "./wizard";

/** Text with DOIs and URLs as links. */
export function Linked({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer">{p.text}</a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

type Props = {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  dataFiles: DataFile[];
  onUploaded: () => void;
  mini?: ReactNode; // live figure for this parameter
  figure?: ReactNode; // the step's schematic with this parameter's region highlighted (when there is no mini figure)
  active?: boolean; // shows the mini figure under the field
  onActivate?: (name: string | null) => void; // hover / focus: highlights the region in the step figure
  onFocusField?: (name: string) => void;
};

/**
 * A documented parameter: label and unit, the input, a mark and a reset
 * button when it differs from the default, and a "?" button that opens a
 * short explanation with its source and figure.
 */
export function DocField({ field, value, onChange, dataFiles, onUploaded, mini, figure, active, onActivate, onFocusField }: Props) {
  const id = useId();
  const { doc, name, def } = field;
  const changed = isChanged(value, def);
  return (
    <div
      className={`doc-field${changed ? " changed" : ""}${active ? " active" : ""}`}
      data-param={name}
      onMouseEnter={() => onActivate?.(name)}
      onMouseLeave={() => onActivate?.(null)}
      onFocus={() => {
        onActivate?.(name);
        onFocusField?.(name);
      }}
    >
      <div className="df-row">
        <label htmlFor={id} className="df-label">
          {changed && <span className="changed-dot" aria-label="changed from default" title="Changed from default" />}
          {doc.label}
          {doc.symbol && <> <MathSymbol symbol={doc.symbol} /></>}
          {doc.unit && <span className="unit"> ({doc.unit})</span>}
        </label>
        <div className="df-input">
          <ParamInput id={id} name={name} value={value} def={def} choices={field.choices} dataFiles={dataFiles} onChange={onChange} onUploaded={onUploaded} />
        </div>
        <div className="df-actions">
          {changed && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Reset ${doc.label} to the default, ${formatValue(def)}`}
              title={`Reset to default: ${formatValue(def)}`}
              onClick={() => onChange(def)}
            >
              ↺
            </button>
          )}
          <HelpButton doc={doc} name={name} def={def} value={value} figure={mini ?? figure} />
        </div>
      </div>
      {active && mini && <div className="df-mini" aria-live="polite">{mini}</div>}
    </div>
  );
}

/** The "?" button: a one-line tooltip on hover, the full explanation with source and figure on click. */
export function HelpButton({ doc, name, def, value, figure }: {
  doc: ParamDoc;
  name: string;
  def: unknown;
  value: unknown;
  figure?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const tip = doc.help ? firstSentence(doc.help) : `${doc.label} (no description yet)`;
  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-btn help-btn"
        aria-label={`About ${doc.label}`}
        aria-haspopup="dialog"
        title={tip}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <HelpDialog
          title={doc.label}
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
        >
          {doc.help ? <p><Linked text={doc.help} /></p> : <p className="muted">No description of this parameter yet.</p>}
          <dl className="help-facts">
            {doc.unit && (<><dt>Unit</dt><dd>{doc.unit}</dd></>)}
            <dt>Default</dt><dd>{formatValue(def)}</dd>
            <dt>Current</dt><dd>{formatValue(value === undefined ? def : value)}</dd>
            <dt>Source</dt><dd>{doc.source ? <Linked text={doc.source} /> : <span className="muted">not documented yet</span>}</dd>
            <dt>Name</dt><dd><code>{name}</code></dd>
          </dl>
          {figure && <div className="help-figure">{figure}</div>}
        </HelpDialog>
      )}
    </>
  );
}

/**
 * A small dialog over the page: Escape or the close button closes it, Tab
 * stays inside it, and focus returns to the opener (done by the caller).
 */
export function HelpDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex='0']")];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="row between">
          <h3 id={id}>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
