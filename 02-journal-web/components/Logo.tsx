"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";

type Size = "sm" | "md" | "lg";

const DIMS: Record<Size, { w: number; h: number; viewBox: string; nameY: number; nameSize: number; pathStroke: number; tagY: number; tagSize: number; tagSpacing: number }> = {
  sm: {
    w: 84,
    h: 28,
    viewBox: "0 0 260 100",
    nameY: 48,
    nameSize: 38,
    pathStroke: 1,
    tagY: 92,
    tagSize: 7,
    tagSpacing: 5,
  },
  md: {
    w: 120,
    h: 40,
    viewBox: "0 0 260 100",
    nameY: 48,
    nameSize: 38,
    pathStroke: 1,
    tagY: 92,
    tagSize: 7,
    tagSpacing: 5,
  },
  lg: {
    w: 260,
    h: 100,
    viewBox: "0 0 260 100",
    nameY: 48,
    nameSize: 38,
    pathStroke: 1,
    tagY: 92,
    tagSize: 7,
    tagSpacing: 5,
  },
};

export function Logo({
  size = "md",
  showTagline,
  className = "",
}: {
  size?: Size;
  showTagline?: boolean;
  className?: string;
}) {
  const dims = DIMS[size];
  const tagline = showTagline ?? size === "lg";

  const clicksRef = useRef<number[]>([]);
  const [hala, setHala] = useState(false);

  function onClick() {
    const now = Date.now();
    clicksRef.current = clicksRef.current.filter((t) => now - t < 1500);
    clicksRef.current.push(now);
    if (clicksRef.current.length >= 3) {
      clicksRef.current = [];
      setHala(true);
      window.setTimeout(() => setHala(false), 3000);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="GIO"
        className={`inline-flex items-center select-none cursor-pointer ${className}`}
        style={{ background: "transparent", border: "none", padding: 0 }}
      >
        <svg
          width={dims.w}
          height={dims.h}
          viewBox={dims.viewBox}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block" }}
        >
          <text
            x="130"
            y={dims.nameY}
            textAnchor="middle"
            fontFamily="var(--font-cormorant), 'Cormorant Garamond', Georgia, serif"
            fontSize={dims.nameSize}
            fill="#F5F1E8"
            fontStyle="italic"
            fontWeight="400"
          >
            Gio
          </text>
          <path
            d="M 70 76 L 88 76 L 102 64 L 118 70 L 134 56 L 152 50 L 172 38"
            stroke="#C77797"
            strokeWidth={dims.pathStroke}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="172" cy="38" r="2.5" fill="#C77797" />
          {tagline && (
            <text
              x="130"
              y={dims.tagY}
              textAnchor="middle"
              fontFamily="var(--font-inter-tight), 'Inter Tight', sans-serif"
              fontSize={dims.tagSize}
              fill="#8B8780"
              letterSpacing={dims.tagSpacing}
              fontWeight="500"
            >
              ICT TRADING SYSTEM
            </text>
          )}
        </svg>
      </button>
      {hala && <HalaOverlay />}
    </>
  );
}

function HalaOverlay() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none gio-hala"
      style={{ backdropFilter: "blur(8px)", background: "rgba(5,5,7,0.55)" }}
    >
      <span
        className="font-italic italic"
        style={{
          fontFamily:
            "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
          color: "#C9A96E",
          fontSize: "5rem",
          letterSpacing: "0.02em",
        }}
      >
        Hala Madrid
      </span>
    </div>,
    document.body,
  );
}
