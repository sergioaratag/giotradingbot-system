export type NoteDTO = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export function notePreview(content: string, n = 60): string {
  const stripped = content
    .replace(/[#*`_>~\-]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= n) return stripped;
  return stripped.slice(0, n).trimEnd() + "…";
}

export function wordCount(content: string): number {
  const t = content.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
