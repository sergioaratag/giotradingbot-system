"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";

const STORAGE_KEY = "sidebar_collapsed";

// Feature 2 (6B): maneja el estado colapsado del sidebar y lo comparte con el
// padding del contenido. Persiste en localStorage.
export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-onyx">
      <Sidebar user={user} collapsed={collapsed} onToggle={toggle} />
      <div
        className={`${collapsed ? "pl-16" : "pl-60"} flex flex-col min-h-screen transition-[padding] duration-200`}
      >
        {children}
      </div>
    </div>
  );
}
