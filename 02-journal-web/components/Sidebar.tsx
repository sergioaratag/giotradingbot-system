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
  PanelLeftClose,
  PanelLeftOpen,
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
  collapsed = false,
  onToggle,
}: {
  user: { name?: string | null; email?: string | null };
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const initial = (user.name?.trim()?.[0] ?? user.email?.[0] ?? "G").toUpperCase();

  return (
    <aside
      className={`fixed inset-y-0 left-0 ${collapsed ? "w-16" : "w-60"} h-screen bg-coal flex flex-col transition-[width] duration-200`}
      style={{ borderRight: "0.5px solid var(--color-graphite)" }}
    >
      <div className={`pt-9 pb-7 flex items-center ${collapsed ? "justify-center px-0" : "justify-between px-6"}`}>
        {!collapsed && <Logo size="sm" />}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          title={collapsed ? "Expandir" : "Colapsar"}
          className="text-mute hover:text-cream transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.6} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={1.6} />}
        </button>
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
              title={collapsed ? label : undefined}
              className={`relative flex items-center gap-3 py-2.5 text-sm transition-all duration-150 ${
                collapsed ? "px-0 justify-center" : "px-3"
              } ${
                active
                  ? "bg-coal text-cream font-medium"
                  : "text-cream-muted hover:bg-shadow/40 hover:text-cream"
              } ${active || collapsed ? "" : "hover:translate-x-0.5"}`}
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
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        className={`mt-auto pt-4 pb-6 ${collapsed ? "px-0 flex flex-col items-center gap-3" : "px-5"}`}
        style={{ borderTop: "0.5px solid var(--color-graphite)" }}
      >
        <div className={`flex items-center min-w-0 ${collapsed ? "justify-center" : "gap-3"}`}>
          <div
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-cream text-xs font-medium"
            style={{ background: "var(--color-rose-deep)" }}
            title={collapsed ? (user.name || user.email || "") ?? "" : undefined}
          >
            {initial}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="text-sm font-medium text-cream truncate">
                {user.name || "Sergio"}
              </div>
              <div className="text-xs text-mute truncate">{user.email}</div>
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`flex items-center gap-2 text-xs text-mute hover:text-rose transition-colors ${collapsed ? "mt-0 justify-center" : "mt-4"}`}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          {!collapsed && "Cerrar sesión"}
        </button>
      </div>
    </aside>
  );
}
