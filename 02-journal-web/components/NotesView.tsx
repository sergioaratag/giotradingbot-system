"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  CATEGORY_COLOR_VAR,
  NOTE_CATEGORIES,
  getCategory,
} from "@/lib/note-categories";
import { type NoteDTO, notePreview, wordCount } from "@/lib/notes";
import { playSound } from "@/lib/sounds";
import { MarkdownEditor, type SaveState } from "./MarkdownEditor";

const ALL = "ALL";

export function NotesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);

  const [activeNote, setActiveNote] = useState<NoteDTO | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftCategory, setDraftCategory] = useState<string | null>(null);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryFilter !== ALL) params.set("category", categoryFilter);
    const res = await fetch(`/api/notes?${params.toString()}`);
    const data = await res.json();
    setNotes(data.notes ?? []);
    setLoading(false);
  }, [debouncedSearch, categoryFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // load active note (independent of filtered list)
  useEffect(() => {
    let alive = true;
    if (!activeId) {
      setActiveNote(null);
      return;
    }
    (async () => {
      const res = await fetch(`/api/notes/${activeId}`);
      if (!res.ok) {
        if (alive) {
          setActiveNote(null);
          router.replace("/notes");
        }
        return;
      }
      const data = await res.json();
      if (!alive) return;
      const n: NoteDTO = data.note;
      setActiveNote(n);
      setDraftTitle(n.title);
      setDraftContent(n.content);
      setDraftCategory(n.category);
      setDraftTags(n.tags);
      setSaveState("idle");
      setLastSavedAt(new Date(n.updatedAt));
    })();
    return () => {
      alive = false;
    };
  }, [activeId, router]);

  function selectNote(id: string) {
    playSound("tap");
    const params = new URLSearchParams(searchParams);
    params.set("id", id);
    router.push(`/notes?${params.toString()}`);
  }

  async function createNote() {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Nota sin título",
        content: "",
        category: categoryFilter !== ALL ? categoryFilter : null,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    playSound("success");
    await loadList();
    router.push(`/notes?id=${data.note.id}`);
  }

  async function persistDraft(payload: {
    title: string;
    content: string;
    category: string | null;
    tags: string[];
  }) {
    if (!activeNote) return;
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/notes/${activeNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      const n: NoteDTO = data.note;
      setActiveNote(n);
      setLastSavedAt(new Date(n.updatedAt));
      setSaveState("saved");
      setNotes((prev) => {
        const others = prev.filter((x) => x.id !== n.id);
        return [n, ...others];
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSaveState("error");
    }
  }

  // schedule autosave whenever draft changes (and is "dirty")
  function scheduleSave(next: {
    title?: string;
    content?: string;
    category?: string | null;
    tags?: string[];
  }) {
    if (!activeNote) return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistDraft({
        title: next.title ?? draftTitle,
        content: next.content ?? draftContent,
        category: next.category !== undefined ? next.category : draftCategory,
        tags: next.tags ?? draftTags,
      });
    }, 2000);
  }

  function onTitle(v: string) {
    setDraftTitle(v);
    scheduleSave({ title: v });
  }
  function onContent(v: string) {
    setDraftContent(v);
    scheduleSave({ content: v });
  }
  function onCategory(v: string | null) {
    setDraftCategory(v);
    scheduleSave({ category: v });
  }
  function commitTag() {
    const t = tagInput.trim().replace(/,$/, "");
    if (!t) return;
    if (draftTags.includes(t)) {
      setTagInput("");
      return;
    }
    const next = [...draftTags, t];
    setDraftTags(next);
    setTagInput("");
    scheduleSave({ tags: next });
  }
  function removeTag(t: string) {
    const next = draftTags.filter((x) => x !== t);
    setDraftTags(next);
    scheduleSave({ tags: next });
  }

  async function deleteActive() {
    if (!activeNote) return;
    if (!confirm(`¿Eliminar "${activeNote.title}"?`)) return;
    const res = await fetch(`/api/notes/${activeNote.id}`, { method: "DELETE" });
    if (!res.ok) return;
    playSound("close");
    router.replace("/notes");
    setActiveNote(null);
    await loadList();
  }

  const filteredCount = useMemo(() => notes.length, [notes]);

  return (
    <div
      className="flex bg-onyx"
      style={{ height: "calc(100vh - 9rem)", marginTop: "-0.5rem" }}
    >
      <aside
        className="w-[280px] shrink-0 flex flex-col bg-coal min-h-0"
        style={{ borderRight: "0.5px solid var(--color-graphite)" }}
      >
        <div className="p-3 space-y-3" style={{ borderBottom: "0.5px solid var(--color-graphite)" }}>
          <button
            onClick={createNote}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98]"
            style={{
              background: "var(--color-rose)",
              color: "var(--color-onyx)",
              letterSpacing: "0.18em",
            }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nueva nota
          </button>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mute"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-full bg-onyx text-cream text-sm rounded-md pl-8 pr-3 py-2 outline-none"
              style={{ border: "0.5px solid var(--color-graphite)" }}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            <CategoryChip
              label="All"
              active={categoryFilter === ALL}
              onClick={() => setCategoryFilter(ALL)}
            />
            {NOTE_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.key}
                label={c.label}
                color={CATEGORY_COLOR_VAR[c.color]}
                active={categoryFilter === c.key}
                onClick={() => setCategoryFilter(c.key)}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="px-4 py-6 text-xs text-mute">Cargando…</div>
          )}
          {!loading && filteredCount === 0 && (
            <div className="px-4 py-6 text-xs text-mute">
              {debouncedSearch ? "Sin resultados." : "No hay notas todavía."}
            </div>
          )}
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              active={n.id === activeId}
              onClick={() => selectNote(n.id)}
            />
          ))}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        {!activeNote ? (
          <div className="flex-1 flex items-center justify-center text-mute text-sm">
            Selecciona una nota o crea una nueva.
          </div>
        ) : (
          <>
            <div
              className="px-6 pt-6 pb-3 space-y-3 bg-onyx"
              style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
            >
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => onTitle(e.target.value)}
                className="w-full bg-transparent text-cream outline-none"
                style={{
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: "1.6rem",
                  letterSpacing: "-0.01em",
                }}
                placeholder="Título…"
              />

              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={draftCategory ?? ""}
                  onChange={(e) => onCategory(e.target.value || null)}
                  className="bg-coal text-dust text-xs rounded-md px-2.5 py-1.5 outline-none uppercase"
                  style={{
                    border: "0.5px solid var(--color-graphite)",
                    letterSpacing: "0.12em",
                  }}
                >
                  <option value="">Sin categoría</option>
                  {NOTE_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-[200px]">
                  {draftTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 bg-shadow text-dust rounded-sm px-2 py-0.5 text-[10px] uppercase"
                      style={{ letterSpacing: "0.08em" }}
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="hover:text-rose"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commitTag();
                      }
                    }}
                    onBlur={commitTag}
                    placeholder="+ tag"
                    className="bg-transparent text-cream text-xs outline-none px-1 py-0.5 min-w-[90px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <MarkdownEditor
                value={draftContent}
                onChange={onContent}
                saveState={saveState}
                lastSavedAt={lastSavedAt}
              />
            </div>

            <div
              className="px-4 py-2 flex items-center justify-between text-[11px] text-mute bg-coal"
              style={{ borderTop: "0.5px solid var(--color-graphite)" }}
            >
              <span style={{ letterSpacing: "0.06em" }}>
                {wordCount(draftContent)} palabras
              </span>
              <button
                type="button"
                onClick={deleteActive}
                className="inline-flex items-center gap-1 hover:text-rose-deep transition-colors"
              >
                <Trash2 className="h-3 w-3" strokeWidth={1.5} /> Eliminar
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] uppercase px-2 py-1 transition-colors rounded-sm"
      style={{
        letterSpacing: "0.14em",
        background: active ? "rgba(199,119,151,0.10)" : "var(--color-onyx)",
        color: active ? "var(--color-rose)" : color ?? "var(--color-dust)",
        border: `0.5px solid ${active ? "var(--color-rose)" : "var(--color-graphite)"}`,
      }}
    >
      {label}
    </button>
  );
}

function timeSince(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return "ahora";
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`;
  const days = Math.floor(diffSec / 86400);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

function NoteRow({
  note,
  active,
  onClick,
}: {
  note: NoteDTO;
  active: boolean;
  onClick: () => void;
}) {
  const cat = getCategory(note.category);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left px-4 py-3 transition-colors block"
      style={{
        background: active ? "var(--color-coal)" : "transparent",
        borderBottom: "0.5px solid var(--color-graphite)",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background =
            "rgba(31,31,38,0.40)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2"
          style={{ width: "2px", background: "var(--color-rose)" }}
        />
      )}
      <div className="text-cream text-sm font-medium truncate">
        {note.title || "Sin título"}
      </div>
      <div className="text-mute text-xs truncate mt-0.5">
        {notePreview(note.content) || "—"}
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        {cat ? (
          <span
            className="inline-block uppercase text-[10px] px-1.5 py-0.5"
            style={{
              letterSpacing: "0.14em",
              color: CATEGORY_COLOR_VAR[cat.color],
              border: `0.5px solid ${CATEGORY_COLOR_VAR[cat.color]}`,
            }}
          >
            {cat.label}
          </span>
        ) : (
          <span />
        )}
        <span
          className="text-mute text-[10px]"
          style={{ letterSpacing: "0.04em" }}
        >
          {timeSince(note.updatedAt)}
        </span>
      </div>
    </button>
  );
}
