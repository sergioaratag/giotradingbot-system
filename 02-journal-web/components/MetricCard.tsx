type Tone = "default" | "profit" | "loss";

export function MetricCard({
  label,
  value,
  sub,
  tone = "default",
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  progress?: number; // 0..1
}) {
  const toneClass =
    tone === "profit"
      ? "text-rose"
      : tone === "loss"
      ? "text-mute"
      : "text-cream";
  return (
    <div
      className="bg-coal rounded-lg p-6 gio-spring"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <div
        className="text-[10px] uppercase text-mute font-medium"
        style={{ letterSpacing: "0.18em" }}
      >
        {label}
      </div>
      <div className={`mt-3 font-mono text-2xl tabular-nums ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-dust">{sub}</div>}
      {progress !== undefined && (
        <div
          className="mt-3 h-px w-full"
          style={{ background: "var(--color-graphite)" }}
        >
          <div
            className="h-px"
            style={{
              background: "var(--color-rose)",
              width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
              transition: "width 600ms ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
}
