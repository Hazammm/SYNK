// The Synk mark: two links that meet in the middle and read as an S.
// The upper link takes the text colour, the lower one the accent.
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M15.5 4.5H9.25a3.75 3.75 0 0 0 0 7.5H12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 19.5h6.25a3.75 3.75 0 0 0 0-7.5H12" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.36), color: "var(--text)", fontWeight: 600, fontSize: Math.round(size * 0.82), letterSpacing: "-0.035em", lineHeight: 1 }}>
      <LogoMark size={size} />
      <span>synk</span>
    </span>
  );
}
