"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { STATUS_LABEL, type TaskDTO } from "@/lib/tasks";
import { TaskCard } from "./TaskCard";

export function KanbanColumn({
  status,
  tasks,
  onAdd,
  onSelect,
}: {
  status: TaskStatus;
  tasks: TaskDTO[];
  onAdd: (status: TaskStatus) => void;
  onSelect: (task: TaskDTO) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-72 shrink-0 rounded-lg transition-colors"
      style={{
        background: "rgba(21,21,26,0.4)",
        border: `0.5px solid ${
          isOver ? "var(--color-rose)" : "var(--color-graphite)"
        }`,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
      >
        <div className="flex items-center gap-2">
          <h2
            className="text-mute uppercase font-medium"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {STATUS_LABEL[status]}
          </h2>
          <span className="text-xs font-mono text-dust">{tasks.length}</span>
        </div>
        <button
          onClick={() => onAdd(status)}
          className="text-mute hover:text-rose transition-colors"
          title="Agregar tarea"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-32">
        {tasks.length === 0 ? (
          <div className="text-xs text-mute text-center py-4">Sin tareas</div>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} />
          ))
        )}
      </div>
    </div>
  );
}
