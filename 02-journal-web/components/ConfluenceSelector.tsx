"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import {
  ICT_CATEGORIES,
  ICT_CATEGORY_ORDER,
  ICT_CONCEPTS,
  type ICTCategory,
  type ICTConcept,
} from "@/lib/ict-concepts";
import { ICTIcon } from "./icons/ICTIcon";

const DEFAULT_OPEN: ICTCategory[] = ["liquidity", "manipulation"];

export function ConfluenceSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<ICTCategory[]>(DEFAULT_OPEN);

  const q = search.trim().toLowerCase();
  const filteredByCat = useMemo(() => {
    const result: Partial<Record<ICTCategory, ICTConcept[]>> = {};
    for (const cat of ICT_CATEGORY_ORDER) {
      const items = ICT_CONCEPTS.filter((c) => c.category === cat).filter((c) => {
        if (!q) return true;
        return (
          c.key.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
        );
      });
      if (items.length > 0) result[cat] = items;
    }
    return result;
  }, [q]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  function toggle(key: string) {
    if (selectedSet.has(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  }

  function isCatOpen(cat: ICTCategory) {
    if (q) return true;
    return openCats.includes(cat);
  }

  function toggleCat(cat: ICTCategory) {
    setOpenCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mute"
          strokeWidth={1.5}
        />
        <input
          type="text"
          placeholder="Buscar concepto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-onyx text-cream text-sm rounded-md pl-9 pr-3 py-2 outline-none"
          style={{ border: "0.5px solid var(--color-graphite)" }}
        />
      </div>

      <div className="space-y-2">
        {ICT_CATEGORY_ORDER.map((cat) => {
          const items = filteredByCat[cat];
          if (!items) return null;
          const open = isCatOpen(cat);
          const selectedInCat = items.filter((i) => selectedSet.has(i.key)).length;

          return (
            <section
              key={cat}
              className="rounded-md bg-coal/40"
              style={{ border: "0.5px solid var(--color-graphite)" }}
            >
              <button
                type="button"
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-mute transition-transform ${
                      open ? "rotate-90" : ""
                    }`}
                    strokeWidth={2}
                  />
                  <span
                    className="text-cream-muted uppercase"
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.18em",
                      fontWeight: 500,
                    }}
                  >
                    {ICT_CATEGORIES[cat].label}
                  </span>
                </div>
                <span
                  className="font-mono text-mute"
                  style={{ fontSize: "10px" }}
                >
                  {selectedInCat}/{items.length}
                </span>
              </button>

              {open && (
                <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map((c) => {
                    const selected = selectedSet.has(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggle(c.key)}
                        title={c.description}
                        className="relative flex flex-col items-center gap-1.5 rounded-md p-2.5 transition-all hover:bg-graphite/60"
                        style={{
                          background: selected
                            ? "rgba(199,119,151,0.10)"
                            : "var(--color-coal)",
                          border: `0.5px solid ${
                            selected
                              ? "var(--color-rose)"
                              : "var(--color-graphite)"
                          }`,
                        }}
                      >
                        <span
                          className="absolute top-1 right-1.5 font-mono text-mute"
                          style={{ fontSize: "9px", letterSpacing: "0.04em" }}
                        >
                          {c.key}
                        </span>
                        <ICTIcon conceptKey={c.key} size={28} />
                        <span
                          className="text-cream text-center leading-tight"
                          style={{ fontSize: "10px", letterSpacing: "0.02em" }}
                        >
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {Object.keys(filteredByCat).length === 0 && (
          <p className="text-xs text-mute text-center py-6">
            Sin resultados para “{search}”.
          </p>
        )}
      </div>
    </div>
  );
}
