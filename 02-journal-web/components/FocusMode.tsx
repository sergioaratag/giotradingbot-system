"use client";

import { useEffect, useState } from "react";

export function FocusMode() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const v = window.localStorage.getItem("focus_default");
      if (v === "true") setActive(true);
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+. (period) toggles
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setActive((v) => !v);
      } else if (e.key === "Escape" && document.body.classList.contains("focus-mode")) {
        setActive(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("focus-mode", active);
  }, [active]);

  if (!active) return null;
  return (
    <div
      className="fixed bottom-3 left-3 z-50 font-mono text-[10px] text-dust pointer-events-none"
      style={{ letterSpacing: "0.18em" }}
    >
      FOCUS MODE · ESC
    </div>
  );
}
