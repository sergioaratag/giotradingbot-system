import type { Priority, TaskStatus } from "@prisma/client";

export type TaskDTO = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  tags: string[];
  forClaudeCode: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export const STATUSES: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "DONE",
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

// Dot color indicator — no border-l, respeta no-radius rule
export const PRIORITY_DOT: Record<Priority, string | null> = {
  URGENT: "var(--color-rose)",
  HIGH: "var(--color-violet)",
  MEDIUM: "var(--color-dust)",
  LOW: null,
};
