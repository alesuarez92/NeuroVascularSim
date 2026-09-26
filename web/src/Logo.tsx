/** App logo: a feeding vessel splitting into a wide (fast) and a narrow (slow) daughter branch. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#e34948" strokeLinecap="round">
        <path d="M3 17H12" strokeWidth={6} />
        <path d="M12 17C18 17 19 7 29 6" strokeWidth={5} />
        <path d="M12 17C18 17 19 26 29 27" strokeWidth={3} />
      </g>
    </svg>
  );
}
