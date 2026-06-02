"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  LineChart,
  TrendingUp,
  CheckSquare,
  FileText,
  CalendarDays,
  Lock,
  Settings,
  LogOut,
} from "lucide-react";
import { Logo } from "./Logo";
import { playSound } from "@/lib/sounds";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/chart", label: "Chart", icon: LineChart },
  { href: "/trades", label: "Trades", icon: TrendingUp },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/news", label: "News", icon: CalendarDays },
  { href: "/vault", label: "Vault", icon: Lock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  user,
}: {
  user: { name?: string | null; email?: string | null };
}) {
  const pathname = usePathname();
  const initial = (user.name?.trim()?.[0] ?? user.email?.[0] ?? "G").toUpperCase();

  return (
    <aside
      className="fixed inset-y-0 left-0 w-60 h-screen bg-coal flex flex-col"
      style={{ borderRight: "0.5px solid var(--color-graphite)" }}
    >
      <div className="pt-9 pb-7 px-6">
        <Logo size="sm" />
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          // Match exacto para rutas "raiz" como /dashboard que tienen
          // hermanas mas especificas (ej. /dashboard/chart); prefix match
          // para el resto.
          const isRootShared = href === "/dashboard";
          const active = isRootShared
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              data-secondary={active ? undefined : "true"}
              onClick={() => playSound("tap")}
              className={`relative flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150 ${
                active
                  ? "bg-coal text-cream font-medium"
                  : "text-cream-muted hover:bg-shadow/40 hover:text-cream hover:translate-x-0.5"
              }`}
              style={{ letterSpacing: "0.3px" }}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5"
                  style={{ width: "2px", background: "var(--color-rose)" }}
                />
              )}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto px-5 pt-4 pb-6"
        style={{ borderTop: "0.5px solid var(--color-graphite)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-cream text-xs font-medium"
            style={{ background: "var(--color-rose-deep)" }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-sm font-medium text-cream truncate">
              {user.name || "Sergio"}
            </div>
            <div className="text-xs text-mute truncate">{user.email}</div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-4 flex items-center gap-2 text-xs text-mute hover:text-rose transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
