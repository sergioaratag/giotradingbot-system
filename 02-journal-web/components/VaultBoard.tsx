"use client";

import { useState } from "react";
import { Plus, Pin, Trash2, Award } from "lucide-react";
import { playSound } from "@/lib/sounds";

export type VaultType =
  | "GOAL"
  | "QUOTE"
  | "IMAGE"
  | "DREAM"
  | "REMINDER"
  | "MILESTONE";

export type VaultEntryDTO = {
  id: string;
  type: VaultType;
  title: string | null;
  content: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: string;
};

const TYPES: { id: VaultType; label: string }[] = [
  { id: "GOAL", label: "Meta" },
  { id: "QUOTE", label: "Frase" },
  { id: "DREAM", label: "Sueño" },
  { id: "REMINDER", label: "Recordatorio" },
  { id: "MILESTONE", label: "Hito" },
  { id: "IMAGE", label: "Imagen" },
];

export function VaultBoard({ initial }: { initial: VaultEntryDTO[] }) {
  const [entries, setEntries] = useState(initial);
  const [composer, setComposer] = useState<{ open: boolean; type?: VaultType }>(
    { open: false },
  );
  const [menuOpen, setMenuOpen] = useState(false);

  async function refresh() {
    const res = await fetch("/api/vault");
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
    }
  }

  async function onCreate(payload: {
    type: VaultType;
    title?: string;
    content: string;
    imageUrl?: string;
  }) {
    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      playSound("success");
      setComposer({ open: false });
      refresh();
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar entrada?")) return;
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    refresh();
  }

  async function onTogglePin(id: string, pinned: boolean) {
    await fetch(`/api/vault/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    refresh();
  }

  return (
    <div className="max-w-6xl">
      <header className="pt-2 pb-8 flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-cream"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "2rem",
              letterSpacing: "-0.01em",
            }}
          >
            Vault
          </h1>
          <p
            className="text-dust mt-1"
            style={{
              fontFamily: "var(--font-cormorant), serif",
              fontStyle: "italic",
              fontSize: "1rem",
            }}
          >
            Tu santuario.
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98]"
            style={{
              background: "var(--color-rose)",
              color: "var(--color-onyx)",
              letterSpacing: "0.18em",
            }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nueva entrada
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-44 bg-coal rounded-md py-1 z-20"
              style={{ border: "0.5px solid var(--color-graphite)" }}
            >
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setMenuOpen(false);
                    setComposer({ open: true, type: t.id });
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-cream-muted hover:bg-shadow/40 hover:text-cream transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {entries.length === 0 ? (
        <div
          className="rounded-lg p-10 text-center"
          style={{ border: "0.5px dashed var(--color-graphite)" }}
        >
          <p className="text-dust text-sm">
            Tu vault está vacío. Cuando entres con peso, escribirás aquí.
          </p>
        </div>
      ) : (
        <div
          className="gap-4"
          style={{ columnCount: 3, columnGap: "1rem" }}
        >
          {entries.map((e) => (
            <div
              key={e.id}
              className="mb-4"
              style={{ breakInside: "avoid" }}
            >
              <VaultCard
                entry={e}
                onDelete={() => onDelete(e.id)}
                onTogglePin={() => onTogglePin(e.id, e.pinned)}
              />
            </div>
          ))}
        </div>
      )}

      {composer.open && composer.type && (
        <Composer
          type={composer.type}
          onCancel={() => setComposer({ open: false })}
          onSubmit={onCreate}
        />
      )}
    </div>
  );
}

function VaultCard({
  entry,
  onDelete,
  onTogglePin,
}: {
  entry: VaultEntryDTO;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div className="group relative gio-spring">
      {entry.type === "GOAL" && <GoalCard e={entry} />}
      {entry.type === "QUOTE" && <QuoteCard e={entry} />}
      {entry.type === "DREAM" && <DreamCard e={entry} />}
      {entry.type === "REMINDER" && <ReminderCard e={entry} />}
      {entry.type === "MILESTONE" && <MilestoneCard e={entry} />}
      {entry.type === "IMAGE" && <ImageCard e={entry} />}

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePin}
          className="text-mute hover:text-rose transition-colors p-1"
          title={entry.pinned ? "Desfijar" : "Fijar"}
        >
          <Pin className={`h-3 w-3 ${entry.pinned ? "fill-current text-rose" : ""}`} strokeWidth={1.5} />
        </button>
        <button
          onClick={onDelete}
          className="text-mute hover:text-rose-deep transition-colors p-1"
          title="Eliminar"
        >
          <Trash2 className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function GoalCard({ e }: { e: VaultEntryDTO }) {
  return (
    <div
      className="bg-coal rounded-md p-4 relative"
      style={{ border: "0.5px solid var(--color-graphite)", paddingLeft: "16px" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3"
        style={{ width: "2px", background: "var(--color-rose)" }}
      />
      <div
        className="text-rose uppercase mb-2"
        style={{ fontSize: "9px", letterSpacing: "0.18em" }}
      >
        Meta
      </div>
      {e.title && (
        <h3
          className="text-cream mb-2"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontStyle: "italic",
            fontSize: "1.05rem",
          }}
        >
          {e.title}
        </h3>
      )}
      <p className="text-cream-muted text-sm whitespace-pre-wrap">{e.content}</p>
    </div>
  );
}

function QuoteCard({ e }: { e: VaultEntryDTO }) {
  return (
    <div
      className="rounded-md p-5"
      style={{ background: "rgba(21,21,26,0.5)" }}
    >
      <div
        className="text-rose mb-1"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: "2.2rem",
          lineHeight: 1,
        }}
      >
        “
      </div>
      <p
        className="text-cream-muted"
        style={{
          fontFamily: "var(--font-cormorant), serif",
          fontStyle: "italic",
          fontSize: "1.05rem",
          lineHeight: 1.5,
        }}
      >
        {e.content}
      </p>
      {e.title && (
        <div className="mt-3 text-mute text-xs">— {e.title}</div>
      )}
    </div>
  );
}

function DreamCard({ e }: { e: VaultEntryDTO }) {
  return (
    <div
      className="bg-coal rounded-md overflow-hidden"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      {e.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={e.imageUrl}
          alt={e.title ?? "dream"}
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-4">
        <div
          className="text-violet uppercase mb-1"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          Sueño
        </div>
        {e.title && (
          <h3
            className="text-cream mb-1"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            {e.title}
          </h3>
        )}
        <p className="text-dust text-sm whitespace-pre-wrap">{e.content}</p>
      </div>
    </div>
  );
}

function ReminderCard({ e }: { e: VaultEntryDTO }) {
  return (
    <div
      className="rounded-md p-4"
      style={{
        background: "rgba(168, 120, 187, 0.05)",
        border: "0.5px solid rgba(168, 120, 187, 0.30)",
      }}
    >
      <div
        className="text-violet uppercase mb-2"
        style={{ fontSize: "9px", letterSpacing: "0.18em" }}
      >
        Reminder
      </div>
      {e.title && (
        <h3
          className="text-cream mb-1.5"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          {e.title}
        </h3>
      )}
      <p className="text-cream-muted text-sm whitespace-pre-wrap">{e.content}</p>
    </div>
  );
}

function MilestoneCard({ e }: { e: VaultEntryDTO }) {
  return (
    <div
      className="bg-coal rounded-md p-4"
      style={{ border: "0.5px solid var(--color-gold)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Award className="h-3.5 w-3.5 text-gold" strokeWidth={1.5} />
        <div
          className="text-gold uppercase"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          Milestone
        </div>
      </div>
      {e.title && (
        <h3
          className="text-cream mb-1.5"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontStyle: "italic",
          }}
        >
          {e.title}
        </h3>
      )}
      <p className="text-cream-muted text-sm whitespace-pre-wrap">{e.content}</p>
    </div>
  );
}

function ImageCard({ e }: { e: VaultEntryDTO }) {
  return (
    <div className="rounded-lg overflow-hidden transition-transform hover:scale-[1.02]">
      {e.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.imageUrl} alt={e.title ?? "image"} className="w-full" />
      ) : (
        <div
          className="bg-coal h-32 flex items-center justify-center text-mute text-xs"
          style={{ border: "0.5px solid var(--color-graphite)" }}
        >
          (sin imagen)
        </div>
      )}
      {e.title && <div className="mt-2 text-xs text-dust">{e.title}</div>}
    </div>
  );
}

function Composer({
  type,
  onCancel,
  onSubmit,
}: {
  type: VaultType;
  onCancel: () => void;
  onSubmit: (p: {
    type: VaultType;
    title?: string;
    content: string;
    imageUrl?: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const needsImage = type === "IMAGE" || type === "DREAM";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !imageUrl.trim()) return;
    onSubmit({
      type,
      title: title.trim() || undefined,
      content: content.trim() || title.trim() || "",
      imageUrl: imageUrl.trim() || undefined,
    });
  }

  const inputCls =
    "w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none";
  const inputStyle = { border: "0.5px solid var(--color-graphite)" } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,5,7,0.78)", backdropFilter: "blur(6px)" }}
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-coal rounded-lg p-5 space-y-4 gio-spring"
        style={{ border: "0.5px solid var(--color-shadow)" }}
      >
        <div
          className="text-rose uppercase"
          style={{ fontSize: "10px", letterSpacing: "0.2em" }}
        >
          Nueva · {type.toLowerCase()}
        </div>

        <input
          type="text"
          placeholder="Título (opcional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          style={inputStyle}
        />

        <textarea
          placeholder="Contenido…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className={inputCls}
          style={inputStyle}
        />

        {needsImage && (
          <input
            type="url"
            placeholder="Image URL (opcional)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-mute hover:text-cream px-3 py-2"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-xs uppercase font-medium"
            style={{
              background: "var(--color-rose)",
              color: "var(--color-onyx)",
              letterSpacing: "0.18em",
            }}
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
