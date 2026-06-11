// Fase 6B — Genera un "snapshot de análisis" en markdown para guardar en /notes:
// par, TF, hora Bolivia, contexto del bot y los dibujos del usuario.
import type { BotStateRow } from "./bot-state";
import type { Drawing } from "./drawings";

function biasEs(b: string | null | undefined): string {
  return b === "BULLISH" ? "Alcista ▲" : b === "BEARISH" ? "Bajista ▼" : "Neutral";
}

function fechaBolivia(): string {
  return new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz", hour12: false });
}

function pretty(pair: string): string {
  return `${pair.slice(0, 3)}/${pair.slice(3)}`;
}

export function buildAnalysisTitle(pair: string, tf: string): string {
  return `Análisis ${pretty(pair)} · ${tf}`;
}

export function buildAnalysisMarkdown(
  pair: string,
  tf: string,
  bs: BotStateRow | null,
  drawings: Drawing[],
): string {
  const L: string[] = [];
  L.push(`# Análisis ${pretty(pair)} · ${tf}`);
  L.push(`**${fechaBolivia()} (hora Bolivia)**`, "");

  if (bs) {
    L.push("## Contexto del bot");
    L.push(`- **Bias H4:** ${biasEs(bs.biasH4)}`);
    if (bs.biasD1) L.push(`- **Bias D1:** ${biasEs(bs.biasD1)}`);
    L.push(`- **Killzone:** ${bs.killzone ?? "—"}`);
    if (bs.chochState && bs.chochState !== "NONE") {
      L.push(`- **CHoCH:** ${bs.chochState === "CONFIRMED" ? "Confirmado" : "Pendiente"}`);
    }
    if (bs.currentAction) L.push(`- **El bot:** ${bs.currentAction}`);
    L.push("");

    if (bs.fvgs?.length) {
      L.push("### FVGs activos");
      bs.fvgs.forEach((f) =>
        L.push(
          `- FVG ${f.side === "BULL" ? "Alcista" : "Bajista"} @ ${f.top?.toFixed(5)} → ${f.bot?.toFixed(5)} · ${f.tf} · Q${f.quality}/10`,
        ),
      );
      L.push("");
    }
    if (bs.sweeps?.length) {
      L.push("### Sweeps del día");
      bs.sweeps.forEach((s) =>
        L.push(`- ${s.level ?? "Sweep"} ${s.price != null ? `@ ${s.price.toFixed(5)}` : ""} · ${s.tf ?? ""}`),
      );
      L.push("");
    }
  }

  if (drawings.length) {
    L.push("## Mis dibujos");
    drawings.forEach((d) => {
      if (d.type === "LONG_POSITION" || d.type === "SHORT_POSITION") {
        const dir = d.type === "LONG_POSITION" ? "Long" : "Short";
        L.push(
          `- **Posición ${dir}** @ ${d.entryPrice?.toFixed(5)} · SL ${d.slPrice?.toFixed(5)} · TP ${d.tpPrice?.toFixed(5)} · **R:R 1:${d.rRatio?.toFixed(2) ?? "—"}** · Riesgo $${(d.riskUsd ?? 0).toFixed(0)}`,
        );
      } else if (d.type === "HORIZONTAL_LINE") {
        L.push(`- Línea horizontal @ ${d.geometry.price?.toFixed(5)}`);
      } else if (d.type === "TRENDLINE") {
        L.push(`- Línea de tendencia`);
      } else if (d.type === "RECTANGLE") {
        L.push(`- Rectángulo`);
      } else if (d.type === "VERTICAL_LINE") {
        L.push(`- Línea vertical`);
      }
    });
    L.push("");
  }

  L.push("---", "_Snapshot generado desde el chart (Fase 6B)._");
  return L.join("\n");
}
