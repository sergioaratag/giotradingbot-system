"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X, Bot } from "lucide-react";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  type TaskDTO,
} from "@/lib/tasks";
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
  useEffect(() => titleRef.current?.focus(), []);

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

  return (
    <div
      className="fixed inset-0 z-50 bg-midnight-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-midnight-900 border border-midnight-700 rounded-lg shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-midnight-800">
          <h2 className="text-lg font-semibold text-midnight-50">
            {mode === "create" ? "Nueva tarea" : "Editar tarea"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-midnight-400 hover:text-midnight-50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-midnight-400 mb-1">
              Título *
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-midnight-400 mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info font-mono text-sm"
              placeholder="Soporta markdown..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-midnight-400 mb-1">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>

            {mode === "edit" && (
              <div>
                <label className="block text-xs uppercase tracking-wide text-midnight-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-midnight-400 mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-midnight-800 text-midnight-200 rounded px-2 py-0.5 text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="hover:text-loss"
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
              placeholder="Agregar tag (Enter o coma)"
              className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info text-sm"
            />
          </div>

          <label className="flex items-start gap-3 bg-midnight-800/50 border border-midnight-700 rounded-md p-3 cursor-pointer hover:bg-midnight-800 transition-colors">
            <input
              type="checkbox"
              checked={forClaudeCode}
              onChange={(e) => setForClaudeCode(e.target.checked)}
              className="mt-0.5 accent-info"
            />
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-midnight-50">
                <Bot className="h-4 w-4 text-info" />
                Esta tarea es para Claude Code
              </div>
              <p className="text-xs text-midnight-400 mt-0.5">
                Aparecerá filtrada cuando Claude Code consulte tareas.
              </p>
            </div>
          </label>

          {error && <p className="text-sm text-loss">{error}</p>}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-midnight-800">
          <div>
            {mode === "edit" && (
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm text-loss hover:text-loss-bright disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-midnight-400 hover:text-midnight-50 px-3 py-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="bg-info hover:bg-info/90 disabled:opacity-60 text-white font-medium rounded-md px-4 py-2 text-sm"
            >
              {pending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
