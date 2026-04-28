"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  type TaskDTO,
} from "@/lib/tasks";
import { playSound } from "@/lib/sounds";
import type { Priority, TaskStatus } from "@prisma/client";

type Mode = "create" | "edit";

export function TaskModal({
  mode,
  task,
  defaultStatus,
  onClose,
  onSaved,
}: {
  mode: Mode;
  task?: TaskDTO;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "MEDIUM");
  const [status, setStatus] = useState<TaskStatus>(
    task?.status ?? defaultStatus ?? "BACKLOG",
  );
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [forClaudeCode, setForClaudeCode] = useState(
    task?.forClaudeCode ?? false,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    playSound("open");
  }, []);

  function close() {
    playSound("close");
    onClose();
  }

  function commitTag() {
    const t = tagInput.trim().replace(/,$/, "");
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    const pendingTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags;

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      tags: pendingTags,
      forClaudeCode,
    };

    setPending(true);
    try {
      const res = await fetch(
        mode === "create" ? "/api/tasks" : `/api/tasks/${task!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Error al guardar");
      }
      playSound("success");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!task || !confirm(`¿Eliminar "${task.title}"?`)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  const inputCls =
    "w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none transition-colors";
  const inputStyle = { border: "0.5px solid var(--color-graphite)" } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(5,5,7,0.78)",
        backdropFilter: "blur(6px)",
      }}
      onClick={close}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-coal rounded-lg gio-spring"
        style={{ border: "0.5px solid var(--color-shadow)" }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
        >
          <h2
            className="text-cream"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "1.1rem",
            }}
          >
            {mode === "create" ? "Nueva tarea" : "Editar tarea"}
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-mute hover:text-cream transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Field label="Título *">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>

          <Field label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={`${inputCls} font-mono`}
              style={inputStyle}
              placeholder="Soporta markdown…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridad">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={inputCls}
                style={inputStyle}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>

            {mode === "edit" && (
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className={inputCls}
                  style={inputStyle}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-shadow text-dust rounded-sm px-2 py-0.5 text-xs uppercase"
                  style={{ letterSpacing: "0.08em" }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="hover:text-rose"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
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
              placeholder="Enter o coma para agregar"
              className={inputCls}
              style={inputStyle}
            />
          </Field>

          <label
            className="flex items-start gap-3 rounded-md p-3 cursor-pointer transition-colors hover:bg-shadow/40"
            style={{ border: "0.5px solid var(--color-graphite)" }}
          >
            <input
              type="checkbox"
              checked={forClaudeCode}
              onChange={(e) => setForClaudeCode(e.target.checked)}
              className="mt-0.5"
              style={{ accentColor: "var(--color-violet)" }}
            />
            <div>
              <div
                className="text-violet uppercase"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                For Claude Code
              </div>
              <p className="text-xs text-dust mt-0.5">
                Aparecerá filtrada cuando Claude Code consulte tareas.
              </p>
            </div>
          </label>

          {error && (
            <p className="text-sm" style={{ color: "var(--color-rose-deep)" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-between p-4"
          style={{ borderTop: "0.5px solid var(--color-graphite)" }}
        >
          <div>
            {mode === "edit" && (
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-rose-deep disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                Eliminar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="text-sm text-mute hover:text-cream px-3 py-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md px-4 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-60"
              style={{
                background: "var(--color-rose)",
                color: "var(--color-onyx)",
                letterSpacing: "0.18em",
              }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-mute mb-1.5 uppercase"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
