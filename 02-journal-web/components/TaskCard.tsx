"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bot } from "lucide-react";
import { PRIORITY_BORDER, type TaskDTO } from "@/lib/tasks";

export function TaskCard({
  task,
  onClick,
}: {
  task: TaskDTO;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-drag-ignore]")) return;
        onClick();
      }}
      className={`bg-midnight-900 border border-midnight-800 border-l-4 ${
        PRIORITY_BORDER[task.priority]
      } rounded-md p-3 cursor-grab active:cursor-grabbing hover:bg-midnight-800/60 transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-midnight-50 leading-snug">
          {task.title}
        </h3>
        {task.forClaudeCode && (
          <span
            data-drag-ignore
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono text-info bg-info/10 border border-info/30 rounded px-1.5 py-0.5"
            title="Para Claude Code"
          >
            <Bot className="h-3 w-3" /> Claude
          </span>
        )}
      </div>

      {task.description && (
        <p className="mt-1.5 text-xs text-midnight-300 line-clamp-2">
          {task.description}
        </p>
      )}

      {task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] bg-midnight-800 text-midnight-300 rounded px-1.5 py-0.5"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 text-[10px] text-midnight-500 font-mono">
        {formatDistanceToNow(new Date(task.createdAt), {
          addSuffix: true,
          locale: es,
        })}
      </div>
    </div>
  );
}
