"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, Bot } from "lucide-react";
import type { Priority, TaskStatus } from "@prisma/client";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  type TaskDTO,
} from "@/lib/tasks";
import { KanbanColumn } from "./KanbanColumn";
import { TaskModal } from "./TaskModal";

export function TasksBoard() {
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyClaude, setOnlyClaude] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL");

  const [createOpen, setCreateOpen] = useState<{ open: boolean; status?: TaskStatus }>(
    { open: false },
  );
  const [editing, setEditing] = useState<TaskDTO | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function load() {
    setLoading(true);
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (onlyClaude && !t.forClaudeCode) return false;
      if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, onlyClaude, priorityFilter]);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskDTO[]> = {
      BACKLOG: [],
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };
    for (const t of filtered) map[t.status].push(t);
    return map;
  }, [filtered]);

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const newStatus = e.over?.id as TaskStatus | undefined;
    if (!newStatus || !STATUSES.includes(newStatus)) return;

    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === newStatus) return;

    setTasks((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: newStatus } : x)),
    );

    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) load();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-midnight-50">Tasks</h1>
          <p className="text-sm text-midnight-400">
            Tablero Kanban · arrastra para mover entre columnas
          </p>
        </div>
        <button
          onClick={() => setCreateOpen({ open: true })}
          className="inline-flex items-center gap-1.5 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-md px-3 py-2"
        >
          <Plus className="h-4 w-4" /> Nueva tarea
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOnlyClaude((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 border transition-colors ${
            onlyClaude
              ? "bg-info/10 border-info/40 text-info"
              : "bg-midnight-900 border-midnight-800 text-midnight-300 hover:text-midnight-50"
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          {onlyClaude ? "Solo Claude Code" : "Todas"}
        </button>

        <select
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as Priority | "ALL")
          }
          className="bg-midnight-900 border border-midnight-800 text-midnight-300 text-xs rounded-md px-2.5 py-1.5 outline-none"
        >
          <option value="ALL">Todas las prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>

        {loading && (
          <span className="text-xs text-midnight-500">Cargando...</span>
        )}
      </div>

      <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {STATUSES.map((s) => (
            <KanbanColumn
              key={s}
              status={s}
              tasks={byStatus[s]}
              onAdd={(status) => setCreateOpen({ open: true, status })}
              onSelect={(t) => setEditing(t)}
            />
          ))}
        </DndContext>
      </div>

      {createOpen.open && (
        <TaskModal
          mode="create"
          defaultStatus={createOpen.status}
          onClose={() => setCreateOpen({ open: false })}
          onSaved={() => {
            setCreateOpen({ open: false });
            load();
          }}
        />
      )}

      {editing && (
        <TaskModal
          mode="edit"
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
