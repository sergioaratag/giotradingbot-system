"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Moon,
  LayoutDashboard,
  TrendingUp,
  CheckSquare,
  FileText,
  Calendar,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: TrendingUp },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/news", label: "News", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  user,
}: {
  user: { name?: string | null; email?: string | null };
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-midnight-900 border-r border-midnight-800 flex flex-col">
      <div className="h-16 px-5 flex items-center gap-2 border-b border-midnight-800">
        <Moon className="h-5 w-5 text-info" />
        <span className="font-bold text-midnight-50 tracking-tight">CheoTrader</span>
      </div>

      <nav className="flex-1 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-2 text-sm transition-colors border-l-2 ${
                active
                  ? "bg-midnight-800 border-info text-midnight-50"
                  : "border-transparent text-midnight-300 hover:bg-midnight-800/50 hover:text-midnight-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-midnight-800 p-4">
        <div className="text-sm font-medium text-midnight-50 truncate">
          {user.name || "Usuario"}
        </div>
        <div className="text-xs text-midnight-400 truncate">{user.email}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 flex items-center gap-2 text-xs text-midnight-300 hover:text-loss transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
