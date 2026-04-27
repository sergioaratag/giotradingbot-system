"use client";

import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  trades: "Trades",
  tasks: "Tasks",
  notes: "Notes",
  news: "News",
  settings: "Settings",
  new: "Nueva",
};

function prettySegment(s: string) {
  return LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

export function Header({ botOnline = false }: { botOnline?: boolean }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="h-16 bg-midnight-900 border-b border-midnight-800 flex items-center justify-between px-6">
      <nav className="text-sm text-midnight-300 flex items-center gap-2">
        {segments.length === 0 ? (
          <span className="text-midnight-50">Inicio</span>
        ) : (
          segments.map((s, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-midnight-600">/</span>}
              <span
                className={
                  i === segments.length - 1
                    ? "text-midnight-50"
                    : "text-midnight-400"
                }
              >
                {prettySegment(s)}
              </span>
            </span>
          ))
        )}
      </nav>

      <div className="flex items-center gap-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            botOnline ? "bg-profit" : "bg-midnight-600"
          }`}
        />
        <span className="font-mono text-midnight-300">
          Bot {botOnline ? "ON" : "OFF"}
        </span>
      </div>
    </header>
  );
}
