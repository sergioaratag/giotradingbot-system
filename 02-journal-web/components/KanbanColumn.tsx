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
      className={`flex flex-col w-72 shrink-0 bg-midnight-900/40 border rounded-lg ${
        isOver ? "border-info" : "border-midnight-800"
      } transition-colors`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-midnight-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-midnight-50 uppercase tracking-wide">
            {STATUS_LABEL[status]}
          </h2>
          <span className="text-xs font-mono text-midnight-400 bg-midnight-800 rounded px-1.5">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAdd(status)}
          className="text-midnight-400 hover:text-midnight-50 transition-colors"
          title="Agregar tarea"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-32">
        {tasks.length === 0 ? (
          <div className="text-xs text-midnight-500 text-center py-4">
            Sin tareas
          </div>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} />
          ))
        )}
      </div>
    </div>
  );
}
