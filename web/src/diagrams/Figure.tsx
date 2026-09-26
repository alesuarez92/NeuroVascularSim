import { type KeyboardEvent, type ReactNode, useId } from "react";

/** An accessible inline SVG figure: role img with a title and a description. */
export function Figure({ title, desc, viewBox, className, children, width }: {
  title: string;
  desc: string;
  viewBox: string;
  className?: string;
  width?: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <svg
      className={`figure ${className ?? ""}`}
      viewBox={viewBox}
      role="img"
      aria-labelledby={`${id}t ${id}d`}
      style={width ? { maxWidth: width } : undefined}
    >
      <title id={`${id}t`}>{title}</title>
      <desc id={`${id}d`}>{desc}</desc>
      {children}
    </svg>
  );
}

export type RegionProps = {
  highlight?: string | null; // the region to emphasise
  onSelect?: (region: string) => void; // click or Enter on a region
  onHover?: (region: string | null) => void;
};

/**
 * A clickable, keyboard-focusable part of a figure. Its `.hit` shape (drawn
 * by the caller) outlines the region when it is highlighted or focused.
 */
export function Region({ id, label, highlight, onSelect, onHover, children }: RegionProps & {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const interactive = Boolean(onSelect);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
    }
  };
  return (
    <g
      className={`region${highlight === id ? " active" : ""}${interactive ? " interactive" : ""}`}
      data-region={id}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? label : undefined}
      aria-pressed={interactive ? highlight === id : undefined}
      onClick={interactive ? () => onSelect!(id) : undefined}
      onKeyDown={interactive ? onKey : undefined}
      onMouseEnter={onHover ? () => onHover(id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      {interactive && <title>{label}</title>}
      {children}
    </g>
  );
}
