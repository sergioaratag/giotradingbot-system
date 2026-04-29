export type NoteCategoryColor =
  | "rose"
  | "violet"
  | "gold"
  | "cream"
  | "dust";

export type NoteCategory = {
  key: string;
  label: string;
  color: NoteCategoryColor;
};

export const NOTE_CATEGORIES: NoteCategory[] = [
  { key: "trading", label: "Trading", color: "rose" },
  { key: "reflexion", label: "Reflexión", color: "violet" },
  { key: "aprendizaje", label: "Aprendizaje", color: "gold" },
  { key: "setup", label: "Setup", color: "rose" },
  { key: "mercado", label: "Mercado", color: "cream" },
  { key: "personal", label: "Personal", color: "dust" },
];

export const CATEGORY_COLOR_VAR: Record<NoteCategoryColor, string> = {
  rose: "var(--color-rose)",
  violet: "var(--color-violet)",
  gold: "var(--color-gold)",
  cream: "var(--color-cream)",
  dust: "var(--color-dust)",
};

export function getCategory(key: string | null | undefined) {
  if (!key) return null;
  return NOTE_CATEGORIES.find((c) => c.key === key) ?? null;
}
