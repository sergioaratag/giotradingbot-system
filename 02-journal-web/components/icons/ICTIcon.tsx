// ICT concept icons — single-file registry.
// Style: viewBox 48x48, cream (#F5F1E8) base, rose (#C77797) accent, dust (#8B8780) detail.
// Each icon is an SVGElement returned from a function so they can be composed inline.

import type { JSX } from "react";

const CREAM = "#F5F1E8";
const ROSE = "#C77797";
const DUST = "#8B8780";

type IconFn = () => JSX.Element;

// ===== LIQUIDEZ =====

const LevelIcon = (label: string): IconFn => () => (
  <>
    <line x1="6" y1="14" x2="42" y2="14" stroke={ROSE} strokeWidth="1.2" strokeDasharray="2 2" />
    <rect x="20" y="16" width="6" height="14" fill={CREAM} />
    <line x1="23" y1="30" x2="23" y2="36" stroke={CREAM} strokeWidth="0.8" />
    <text x="24" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE} textAnchor="middle" letterSpacing="0.6">
      {label}
    </text>
  </>
);

// Variant: low (line below candle)
const LevelLowIcon = (label: string): IconFn => () => (
  <>
    <rect x="20" y="16" width="6" height="14" fill={CREAM} />
    <line x1="23" y1="10" x2="23" y2="16" stroke={CREAM} strokeWidth="0.8" />
    <line x1="6" y1="34" x2="42" y2="34" stroke={ROSE} strokeWidth="1.2" strokeDasharray="2 2" />
    <text x="24" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE} textAnchor="middle" letterSpacing="0.6">
      {label}
    </text>
  </>
);

// ===== SWEEP =====

const SweepIcon = (tf: string): IconFn => () => (
  <>
    <line x1="6" y1="14" x2="42" y2="14" stroke={DUST} strokeWidth="0.6" strokeDasharray="2 2" />
    <rect x="20" y="20" width="6" height="14" fill={CREAM} />
    <line x1="23" y1="6" x2="23" y2="20" stroke={ROSE} strokeWidth="1.5" />
    <circle cx="23" cy="10" r="2" fill={ROSE} />
    {tf && (
      <text x="24" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE} textAnchor="middle" letterSpacing="0.4">
        {tf}
      </text>
    )}
  </>
);

// ===== ICONS REGISTRY =====

const ICONS: Record<string, IconFn> = {
  // Liquidez
  PDH: LevelIcon("D"),
  PDL: LevelLowIcon("D"),
  PWH: LevelIcon("W"),
  PWL: LevelLowIcon("W"),
  "LDN-H": LevelIcon("LDN"),
  "LDN-L": LevelLowIcon("LDN"),
  "NY-H": LevelIcon("NY"),
  "NY-L": LevelLowIcon("NY"),
  "ASIA-H": LevelIcon("ASIA"),
  "ASIA-L": LevelLowIcon("ASIA"),

  EQH: () => (
    <>
      <path d="M 8 30 L 14 16 L 20 24 L 28 16 L 34 30" stroke={CREAM} strokeWidth="1" fill="none" strokeLinejoin="round" />
      <line x1="6" y1="16" x2="36" y2="16" stroke={ROSE} strokeWidth="1.2" strokeDasharray="2 2" />
      <text x="38" y="20" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>
        EQ
      </text>
    </>
  ),
  EQL: () => (
    <>
      <path d="M 8 18 L 14 32 L 20 24 L 28 32 L 34 18" stroke={CREAM} strokeWidth="1" fill="none" strokeLinejoin="round" />
      <line x1="6" y1="32" x2="36" y2="32" stroke={ROSE} strokeWidth="1.2" strokeDasharray="2 2" />
      <text x="38" y="36" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>
        EQ
      </text>
    </>
  ),

  // Manipulación
  "SWEEP-H4": SweepIcon("H4"),
  "SWEEP-H1": SweepIcon("H1"),
  "SWEEP-15M": SweepIcon("15m"),
  "SWEEP-5M": SweepIcon("5m"),

  "STOP-RUN": () => (
    <>
      <line x1="6" y1="22" x2="42" y2="22" stroke={DUST} strokeWidth="0.8" strokeDasharray="3 2" />
      <text x="6" y="18" fontFamily="Helvetica, sans-serif" fontSize="5" fill={DUST}>
        STOPS
      </text>
      <line x1="24" y1="32" x2="24" y2="14" stroke={ROSE} strokeWidth="2" />
      <polygon points="24,10 21,14 27,14" fill={ROSE} />
      <rect x="22" y="32" width="4" height="6" fill={CREAM} />
    </>
  ),

  "TURTLE-SOUP": () => (
    <>
      <line x1="6" y1="20" x2="42" y2="20" stroke={DUST} strokeWidth="0.5" strokeDasharray="2 2" />
      <line x1="20" y1="20" x2="20" y2="10" stroke={CREAM} strokeWidth="1" />
      <path d="M 22 14 Q 32 14, 32 26 Q 32 36, 22 36" stroke={ROSE} strokeWidth="1" fill="none" />
      <polygon points="22,36 25,33 25,39" fill={ROSE} />
    </>
  ),

  // Estructura
  CHoCH: () => (
    <>
      <path d="M 6 30 L 14 22 L 22 28 L 30 16 L 38 22" stroke={CREAM} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="22" y1="14" x2="38" y2="14" stroke={DUST} strokeWidth="0.5" strokeDasharray="2 2" />
      <path d="M 38 22 L 42 36" stroke={ROSE} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="42" cy="36" r="2" fill={ROSE} />
    </>
  ),
  BOS: () => (
    <>
      <path d="M 6 32 L 14 26 L 22 30 L 30 22 L 38 14" stroke={CREAM} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="6" y1="22" x2="38" y2="22" stroke={ROSE} strokeWidth="0.5" strokeDasharray="2 2" />
      <path d="M 38 14 L 42 8" stroke={ROSE} strokeWidth="1.5" strokeLinecap="round" />
      <polygon points="42,8 39,12 44,11" fill={ROSE} />
    </>
  ),
  MSS: () => (
    <>
      <path d="M 6 30 L 14 22 L 22 28 L 30 16 L 38 22" stroke={CREAM} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <line x1="14" y1="14" x2="38" y2="14" stroke={DUST} strokeWidth="0.5" strokeDasharray="2 2" />
      <line x1="14" y1="36" x2="42" y2="36" stroke={ROSE} strokeWidth="1.2" />
      <path d="M 38 22 L 42 36" stroke={ROSE} strokeWidth="1.5" />
    </>
  ),
  HH: () => (
    <>
      <path d="M 8 32 L 18 18 L 28 24 L 38 10" stroke={CREAM} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <circle cx="38" cy="10" r="2.5" fill={ROSE} />
      <text x="6" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>HH</text>
    </>
  ),
  HL: () => (
    <>
      <path d="M 8 36 L 18 22 L 28 30 L 38 16" stroke={CREAM} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <circle cx="28" cy="30" r="2.5" fill={ROSE} />
      <text x="6" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>HL</text>
    </>
  ),
  LH: () => (
    <>
      <path d="M 8 16 L 18 30 L 28 22 L 38 36" stroke={CREAM} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <circle cx="28" cy="22" r="2.5" fill={ROSE} />
      <text x="6" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>LH</text>
    </>
  ),
  LL: () => (
    <>
      <path d="M 8 12 L 18 26 L 28 18 L 38 32" stroke={CREAM} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <circle cx="38" cy="32" r="2.5" fill={ROSE} />
      <text x="6" y="46" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>LL</text>
    </>
  ),

  // Imbalance
  FVG: () => (
    <>
      <rect x="10" y="14" width="6" height="20" fill={CREAM} />
      <line x1="13" y1="10" x2="13" y2="14" stroke={CREAM} strokeWidth="1" />
      <rect x="20" y="6" width="6" height="14" fill={ROSE} />
      <line x1="23" y1="2" x2="23" y2="6" stroke={ROSE} strokeWidth="1" />
      <line x1="23" y1="20" x2="23" y2="36" stroke={ROSE} strokeWidth="1" />
      <rect x="30" y="22" width="6" height="20" fill={CREAM} />
      <line x1="33" y1="42" x2="33" y2="46" stroke={CREAM} strokeWidth="1" />
      <rect x="14" y="20" width="20" height="2" fill={ROSE} fillOpacity="0.4" />
    </>
  ),
  IFVG: () => (
    <>
      <rect x="10" y="6" width="6" height="20" fill={CREAM} />
      <rect x="20" y="22" width="6" height="14" fill={ROSE} />
      <rect x="30" y="14" width="6" height="20" fill={CREAM} />
      <line x1="14" y1="22" x2="34" y2="22" stroke={ROSE} strokeWidth="1" strokeDasharray="2 1" />
      <line x1="14" y1="26" x2="34" y2="26" stroke={ROSE} strokeWidth="1" strokeDasharray="2 1" />
      <line x1="40" y1="20" x2="46" y2="26" stroke={ROSE} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="46" y1="20" x2="40" y2="26" stroke={ROSE} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  BPR: () => (
    <>
      <rect x="10" y="14" width="28" height="8" fill={ROSE} fillOpacity="0.3" stroke={ROSE} strokeWidth="0.6" />
      <rect x="10" y="20" width="28" height="8" fill={CREAM} fillOpacity="0.25" stroke={CREAM} strokeWidth="0.6" />
      <text x="6" y="44" fontFamily="Helvetica, sans-serif" fontSize="5" fill={ROSE}>BPR</text>
    </>
  ),
  VI: () => (
    <>
      <rect x="14" y="10" width="6" height="14" fill={CREAM} />
      <rect x="28" y="22" width="6" height="14" fill={CREAM} />
      <rect x="14" y="22" width="20" height="2" fill={ROSE} fillOpacity="0.6" />
      <text x="38" y="44" fontFamily="Helvetica, sans-serif" fontSize="5" fill={ROSE}>VI</text>
    </>
  ),
  OG: () => (
    <>
      <rect x="8" y="10" width="14" height="8" fill={CREAM} stroke={CREAM} strokeWidth="0.5" />
      <rect x="26" y="28" width="14" height="8" fill={CREAM} stroke={CREAM} strokeWidth="0.5" />
      <line x1="22" y1="22" x2="26" y2="22" stroke={ROSE} strokeWidth="1.5" />
      <text x="36" y="44" fontFamily="Helvetica, sans-serif" fontSize="5" fill={ROSE}>OG</text>
    </>
  ),

  // Order Blocks
  OB: () => (
    <>
      <rect x="14" y="14" width="20" height="14" fill={ROSE} fillOpacity="0.3" stroke={ROSE} strokeWidth="1" />
      <rect x="20" y="6" width="2" height="8" fill={CREAM} />
      <rect x="26" y="6" width="2" height="8" fill={CREAM} />
      <line x1="14" y1="34" x2="34" y2="34" stroke={ROSE} strokeWidth="1.5" />
    </>
  ),
  "OB+": () => (
    <>
      <rect x="14" y="14" width="20" height="14" fill={ROSE} fillOpacity="0.3" stroke={ROSE} strokeWidth="1" />
      <line x1="24" y1="34" x2="24" y2="42" stroke={ROSE} strokeWidth="1.5" />
      <polygon points="24,42 21,38 27,38" fill={ROSE} transform="rotate(180, 24, 40)" />
      <text x="6" y="12" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>+</text>
    </>
  ),
  "OB-": () => (
    <>
      <rect x="14" y="14" width="20" height="14" fill={ROSE} fillOpacity="0.3" stroke={ROSE} strokeWidth="1" />
      <line x1="24" y1="6" x2="24" y2="12" stroke={ROSE} strokeWidth="1.5" />
      <polygon points="24,6 21,10 27,10" fill={ROSE} />
      <text x="6" y="44" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE}>−</text>
    </>
  ),
  BB: () => (
    <>
      <rect x="14" y="14" width="20" height="14" fill={ROSE} fillOpacity="0.3" stroke={ROSE} strokeWidth="1" />
      <line x1="10" y1="38" x2="38" y2="6" stroke={CREAM} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  MB: () => (
    <>
      <rect x="14" y="14" width="20" height="14" fill={CREAM} fillOpacity="0.2" stroke={CREAM} strokeWidth="0.8" />
      <circle cx="24" cy="21" r="2.5" fill={ROSE} />
      <line x1="24" y1="32" x2="24" y2="40" stroke={DUST} strokeWidth="0.8" strokeDasharray="2 2" />
    </>
  ),
  POI: () => (
    <>
      <path d="M 24 8 Q 14 8, 14 18 Q 14 28, 24 40 Q 34 28, 34 18 Q 34 8, 24 8 Z" stroke={CREAM} strokeWidth="1" fill="none" />
      <circle cx="24" cy="18" r="4" fill={ROSE} />
    </>
  ),

  // Premium / Discount
  PREMIUM: () => (
    <>
      <rect x="14" y="6" width="20" height="16" fill={ROSE} fillOpacity="0.4" />
      <rect x="14" y="22" width="20" height="2" fill={CREAM} />
      <rect x="14" y="24" width="20" height="16" fill="#1F1F26" stroke={DUST} strokeWidth="0.4" />
      <text x="6" y="16" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE} letterSpacing="1">P</text>
    </>
  ),
  DISCOUNT: () => (
    <>
      <rect x="14" y="6" width="20" height="16" fill="#1F1F26" stroke={DUST} strokeWidth="0.4" />
      <rect x="14" y="22" width="20" height="2" fill={CREAM} />
      <rect x="14" y="24" width="20" height="16" fill={ROSE} fillOpacity="0.4" />
      <text x="6" y="34" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE} letterSpacing="1">D</text>
    </>
  ),
  EQUILIBRIUM: () => (
    <>
      <rect x="14" y="8" width="20" height="32" fill="#1F1F26" stroke={CREAM} strokeWidth="0.5" />
      <line x1="14" y1="24" x2="34" y2="24" stroke={ROSE} strokeWidth="2" />
    </>
  ),
  OTE: () => (
    <>
      <line x1="6" y1="10" x2="42" y2="10" stroke={CREAM} strokeWidth="0.6" />
      <line x1="6" y1="20" x2="42" y2="20" stroke={CREAM} strokeWidth="0.6" />
      <line x1="6" y1="26" x2="42" y2="26" stroke={ROSE} strokeWidth="1.5" />
      <line x1="6" y1="30" x2="42" y2="30" stroke={ROSE} strokeWidth="1.5" />
      <line x1="6" y1="38" x2="42" y2="38" stroke={CREAM} strokeWidth="0.6" />
    </>
  ),

  // Killzones
  "LDN-KZ": KillzoneIcon("LDN"),
  "NY-AM-KZ": KillzoneIcon("AM"),
  "NY-LUNCH": KillzoneIcon("LCH"),
  "NY-PM-KZ": KillzoneIcon("PM"),
  "ASIA-KZ": KillzoneIcon("ASA"),

  // Especiales
  "SILVER-BULLET": () => (
    <>
      <circle cx="24" cy="24" r="14" stroke={CREAM} strokeWidth="0.8" fill="none" />
      <circle cx="24" cy="24" r="9" stroke={CREAM} strokeWidth="0.6" fill="none" />
      <circle cx="24" cy="24" r="4" stroke={ROSE} strokeWidth="0.8" fill="none" />
      <circle cx="24" cy="24" r="2" fill={ROSE} />
    </>
  ),
  "JUDAS-SWING": () => (
    <>
      <line x1="20" y1="8" x2="20" y2="20" stroke={CREAM} strokeWidth="1" />
      <rect x="17" y="20" width="6" height="20" fill={ROSE} />
      <path d="M 28 14 Q 36 14, 36 24 Q 36 34, 30 36" stroke={ROSE} strokeWidth="1" fill="none" />
      <polygon points="30,36 33,33 33,39" fill={ROSE} />
    </>
  ),
  "POWER-OF-3": () => (
    <>
      <rect x="8" y="20" width="8" height="14" fill={CREAM} fillOpacity="0.6" />
      <rect x="20" y="10" width="8" height="28" fill={ROSE} />
      <rect x="32" y="16" width="8" height="20" fill={CREAM} fillOpacity="0.4" />
      <text x="9" y="44" fontFamily="Helvetica, sans-serif" fontSize="5" fill={DUST}>A</text>
      <text x="22" y="44" fontFamily="Helvetica, sans-serif" fontSize="5" fill={ROSE}>M</text>
      <text x="34" y="44" fontFamily="Helvetica, sans-serif" fontSize="5" fill={DUST}>D</text>
    </>
  ),
  AMD: () => (
    <>
      <rect x="6" y="22" width="10" height="14" fill={CREAM} fillOpacity="0.5" />
      <rect x="18" y="8" width="10" height="32" fill={ROSE} />
      <rect x="32" y="14" width="10" height="22" fill={CREAM} fillOpacity="0.3" />
    </>
  ),
  "HIGH-IMPACT": () => (
    <>
      <line x1="24" y1="8" x2="24" y2="40" stroke={ROSE} strokeWidth="1.5" />
      <line x1="8" y1="24" x2="40" y2="24" stroke={ROSE} strokeWidth="1.5" />
      <line x1="13" y1="13" x2="35" y2="35" stroke={ROSE} strokeWidth="1.5" />
      <line x1="35" y1="13" x2="13" y2="35" stroke={ROSE} strokeWidth="1.5" />
      <circle cx="24" cy="24" r="3" fill={ROSE} />
    </>
  ),
};

function KillzoneIcon(label: string): IconFn {
  return () => (
    <>
      <circle cx="24" cy="20" r="12" stroke={CREAM} strokeWidth="1" fill="none" />
      <line x1="24" y1="11" x2="24" y2="20" stroke={ROSE} strokeWidth="1.5" />
      <line x1="24" y1="20" x2="30" y2="20" stroke={CREAM} strokeWidth="1" />
      <circle cx="24" cy="20" r="1" fill={ROSE} />
      <text x="24" y="44" fontFamily="Helvetica, sans-serif" fontSize="6" fill={ROSE} textAnchor="middle" letterSpacing="0.6">
        {label}
      </text>
    </>
  );
}

export function ICTIcon({
  conceptKey,
  size = 16,
  className,
}: {
  conceptKey: string;
  size?: number;
  className?: string;
}) {
  const Render = ICONS[conceptKey];
  if (!Render) {
    return (
      <span
        className={className}
        style={{
          fontSize: Math.max(8, size * 0.55),
          color: DUST,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
        }}
      >
        {conceptKey}
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", flexShrink: 0 }}
      aria-hidden="true"
    >
      <Render />
    </svg>
  );
}

export const HAS_ICON = (key: string) => key in ICONS;
