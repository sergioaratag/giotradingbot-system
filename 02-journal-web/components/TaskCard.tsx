"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { PRIORITY_DOT, type TaskDTO } from "@/lib/tasks";

export function TaskCard({
  task,
  onClick,
}: {
  task: TaskDTO;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const dot = PRIORITY_DOT[task.priority];

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    border: "0.5px solid var(--color-graphite)",
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
      className="relative bg-coal rounded-md p-3 cursor-grab active:cursor-grabbing hover:bg-shadow/40 transition-colors gio-spring"
    >
      {dot && (
        <span
          aria-hidden
          className="absolute top-2 right-2 inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dot }}
        />
      )}

      <div className="flex items-start justify-between gap-2 pr-3">
        <h3 className="text-sm font-medium text-cream leading-snug">
          {task.title}
        </h3>
      </div>

      {task.forClaudeCode && (
        <div
          data-drag-ignore
          className="mt-1.5 uppercase"
          style={{
            color: "var(--color-violet)",
            fontSize: "9px",
            letterSpacing: "0.18em",
          }}
        >
          For Claude
        </div>
      )}

      {task.description && (
        <p className="mt-1.5 text-xs text-cream-muted line-clamp-2">
          {task.description}
        </p>
      )}

      {task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.map((t) => (
            <span
              key={t}
              className="bg-shadow text-dust uppercase rounded-sm px-2 py-0.5"
              style={{ fontSize: "10px", letterSpacing: "0.08em" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 text-[10px] text-mute font-mono">
        {formatDistanceToNow(new Date(task.createdAt), {
          addSuffix: true,
          locale: es,
        })}
      </div>
    </div>
  );
}
