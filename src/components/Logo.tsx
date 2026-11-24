// The Synk mark: chat, issues, docs and time as four shapes in one tile.
// The bubble tail, the page fold and the clock corner meet in the middle, where Synk keeps them in sync.
// Colours come from the --logo-* tokens (chat = accent, tools = ink), so the mark follows the theme
// and switches to its on-dark colours inside the nav frame.
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="216 213 600 600" aria-hidden="true" focusable="false">
      <path fill="var(--logo-chat)" d="M330 220h52a110 110 0 0 1 110 110v162H330a110 110 0 0 1-110-110v-52a110 110 0 0 1 110-110Z" />
      <circle fill="var(--logo-tool)" cx="668" cy="356" r="142" />
      <path fill="none" stroke="var(--logo-check)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" d="m606 360 44 44 84-90" />
      <path fill="var(--logo-tool)" d="M256 532h144l92 92v144a36 36 0 0 1-36 36H256a36 36 0 0 1-36-36V568a36 36 0 0 1 36-36Z" />
      <path fill="var(--logo-fold)" d="m400 532 92 92h-80a12 12 0 0 1-12-12Z" />
      <path fill="var(--logo-tool)" d="M532 532h280a280 280 0 0 1-280 280Z" />
    </svg>
  );
}

// Mark plus wordmark. `size` sets the wordmark scale; the mark is 0.92 of the font size, as in the brand lockup.
export default function Logo({ size = 22, className }: { size?: number; className?: string }) {
  const font = Math.round(size * 0.82);
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: Math.round(font * 0.32), color: "var(--text)", fontWeight: 600, fontSize: font, letterSpacing: "-0.03em", lineHeight: 1 }}>
      <LogoMark size={Math.round(font * 0.92)} />
      <span>synk</span>
    </span>
  );
}
