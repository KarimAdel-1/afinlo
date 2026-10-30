/** Afinlo's assistant, drawn: a small robot in the app's blues, with a visor for a face and headphones on. Decorative. */
export function Mascot({ size = 170 }: { size?: number }) {
  return (
    <svg className="hl-mascot" width={size} height={size} viewBox="0 0 200 200" aria-hidden focusable="false">
      <defs>
        <linearGradient id="hl-mascot-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6e5f7" />
        </linearGradient>
        <linearGradient id="hl-mascot-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f86ff" />
          <stop offset="1" stopColor="#4336ff" />
        </linearGradient>
        <radialGradient id="hl-mascot-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#262a3f" stopOpacity="0.18" />
          <stop offset="1" stopColor="#262a3f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="186" rx="46" ry="7" fill="url(#hl-mascot-shadow)" />
      {/* Wings, then the body */}
      <path d="M58 118c-16 10-26 30-24 48 1 6 8 7 12 3l24-26z" fill="url(#hl-mascot-blue)" />
      <path d="M142 118c16 10 26 30 24 48-1 6-8 7-12 3l-24-26z" fill="url(#hl-mascot-blue)" />
      <path d="M100 102c-26 0-42 20-42 44 0 22 18 34 42 34s42-12 42-34c0-24-16-44-42-44z" fill="url(#hl-mascot-shell)" stroke="#d9d7f0" strokeWidth="1.5" />
      <circle cx="88" cy="140" r="4" fill="#262a3f" />
      <circle cx="100" cy="140" r="4" fill="#262a3f" />
      <circle cx="112" cy="140" r="4" fill="#262a3f" />
      <rect x="90" y="156" width="20" height="5" rx="2.5" fill="#262a3f" />
      {/* Headphones, the head and its visor */}
      <path d="M58 62a42 42 0 0 1 84 0" fill="none" stroke="url(#hl-mascot-blue)" strokeWidth="6" strokeLinecap="round" />
      <rect x="44" y="56" width="18" height="30" rx="9" fill="url(#hl-mascot-blue)" />
      <rect x="138" y="56" width="18" height="30" rx="9" fill="url(#hl-mascot-blue)" />
      <rect x="58" y="40" width="84" height="64" rx="24" fill="url(#hl-mascot-shell)" stroke="#d9d7f0" strokeWidth="1.5" />
      <rect x="68" y="52" width="64" height="38" rx="14" fill="#14152b" />
      <path className="hl-mascot-eye" d="M80 74q7-9 14 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path className="hl-mascot-eye" d="M106 74q7-9 14 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
