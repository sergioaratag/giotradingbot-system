"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Bold,
  Code,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  Pencil,
  Quote,
  SplitSquareHorizontal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ViewMode = "editor" | "preview" | "split";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function MarkdownEditor({
  value,
  onChange,
  saveState,
  lastSavedAt,
}: {
  value: string;
  onChange: (next: string) => void;
  saveState: SaveState;
  lastSavedAt: Date | null;
}) {
  const [view, setView] = useState<ViewMode>("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tick, setTick] = useState(0);

  // re-render every 30s so "hace X" stays fresh
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  function wrapSelection(prefix: string, suffix = prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const before = v.slice(0, s);
    const sel = v.slice(s, e);
    const after = v.slice(e);
    const next = `${before}${prefix}${sel || "texto"}${suffix}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = s + prefix.length + (sel || "texto").length;
      ta.setSelectionRange(cursor, cursor);
    });
  }

  function prefixLine(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    const next = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  function insertLink() {
    wrapSelection("[", "](https://)");
  }

  const savedLabel = computeSavedLabel(saveState, lastSavedAt, tick);

  const handleTextarea = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
    [onChange],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 bg-coal flex-wrap"
        style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
      >
        <div className="flex items-center gap-1 flex-wrap">
          <ToolBtn title="Heading 1" onClick={() => prefixLine("# ")}>
            <Heading1 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Heading 2" onClick={() => prefixLine("## ")}>
            <Heading2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Heading 3" onClick={() => prefixLine("### ")}>
            <Heading3 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Bold" onClick={() => wrapSelection("**")}>
            <Bold className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Italic" onClick={() => wrapSelection("*")}>
            <Italic className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="List" onClick={() => prefixLine("- ")}>
            <List className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Quote" onClick={() => prefixLine("> ")}>
            <Quote className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Code" onClick={() => wrapSelection("`")}>
            <Code className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn title="Link" onClick={insertLink}>
            <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ToolBtn>
        </div>
        <div className="flex items-center gap-1">
          <ViewBtn active={view === "editor"} onClick={() => setView("editor")} title="Editor">
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ViewBtn>
          <ViewBtn active={view === "split"} onClick={() => setView("split")} title="Split">
            <SplitSquareHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ViewBtn>
          <ViewBtn active={view === "preview"} onClick={() => setView("preview")} title="Preview">
            <Eye className="h-3.5 w-3.5" strokeWidth={1.6} />
          </ViewBtn>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {view !== "preview" && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextarea}
            spellCheck={false}
            placeholder="Escribe en markdown…"
            className={`${
              view === "split" ? "w-1/2" : "w-full"
            } h-full bg-onyx text-cream font-mono text-sm p-5 outline-none resize-none leading-relaxed`}
            style={{
              borderRight:
                view === "split"
                  ? "0.5px solid var(--color-graphite)"
                  : undefined,
            }}
          />
        )}
        {view !== "editor" && (
          <div
            className={`${
              view === "split" ? "w-1/2" : "w-full"
            } h-full bg-coal overflow-y-auto p-6`}
          >
            <MarkdownPreview source={value} />
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-between px-4 py-2 bg-coal text-xs text-mute"
        style={{ borderTop: "0.5px solid var(--color-graphite)" }}
      >
        <span style={{ letterSpacing: "0.06em" }}>{savedLabel}</span>
        <span className="text-[10px] uppercase" style={{ letterSpacing: "0.18em" }}>
          markdown
        </span>
      </div>
    </div>
  );
}

function ToolBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center h-7 w-7 text-dust hover:text-cream hover:bg-graphite/60 transition-colors rounded-sm"
    >
      {children}
    </button>
  );
}

function ViewBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center h-7 w-7 transition-colors rounded-sm"
      style={{
        color: active ? "var(--color-rose)" : "var(--color-dust)",
        background: active ? "rgba(199,119,151,0.10)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function computeSavedLabel(
  state: SaveState,
  lastSavedAt: Date | null,
  _tick: number,
): string {
  void _tick;
  if (state === "saving") return "Guardando…";
  if (state === "error") return "Error al guardar";
  if (state === "dirty") return "Cambios sin guardar";
  if (!lastSavedAt) return "—";
  const diff = Math.max(0, (Date.now() - lastSavedAt.getTime()) / 1000);
  if (diff < 5) return "Guardado · ahora";
  if (diff < 60) return `Guardado · hace ${Math.floor(diff)}s`;
  if (diff < 3600) return `Guardado · hace ${Math.floor(diff / 60)} min`;
  return `Guardado · hace ${Math.floor(diff / 3600)} h`;
}

export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="markdown-preview text-cream-muted text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              {...props}
              className="text-cream mt-2 mb-3 text-2xl"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            />
          ),
          h2: (props) => (
            <h2
              {...props}
              className="text-cream mt-5 mb-2 text-xl"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            />
          ),
          h3: (props) => (
            <h3
              {...props}
              className="text-cream mt-4 mb-2 text-base"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            />
          ),
          p: (props) => <p {...props} className="my-2.5" />,
          ul: (props) => <ul {...props} className="list-disc pl-5 my-2.5 space-y-1" />,
          ol: (props) => <ol {...props} className="list-decimal pl-5 my-2.5 space-y-1" />,
          li: (props) => <li {...props} className="text-cream-muted" />,
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="text-rose underline-offset-2 hover:underline"
            />
          ),
          blockquote: (props) => (
            <blockquote
              {...props}
              className="my-3 pl-4 italic text-dust"
              style={{ borderLeft: "2px solid var(--color-rose)" }}
            />
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code
                  {...rest}
                  className={`${className ?? ""} bg-graphite text-rose font-mono block p-3 my-3 text-xs leading-relaxed`}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                {...rest}
                className="bg-graphite text-rose font-mono text-[0.85em] px-1 py-0.5"
              >
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              {...props}
              className="bg-graphite my-3 overflow-x-auto"
              style={{ border: "0.5px solid var(--color-graphite)" }}
            />
          ),
          hr: () => (
            <hr
              className="my-5"
              style={{ borderTop: "0.5px solid var(--color-graphite)", border: 0, height: 0 }}
            />
          ),
          strong: (props) => <strong {...props} className="text-cream font-semibold" />,
          em: (props) => <em {...props} className="text-cream-muted italic" />,
          input: (props) => (
            <input
              {...props}
              disabled={false}
              readOnly
              style={{ accentColor: "var(--color-rose)" }}
              className="mr-2"
            />
          ),
        }}
      >
        {source || "_Vacío. Empieza a escribir…_"}
      </ReactMarkdown>
    </div>
  );
}
