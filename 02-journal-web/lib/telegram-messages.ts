// Formatters de mensajes Telegram. HTML simple (<b>, <i>, <code>) por
// compatibilidad y legibilidad. Cada función recibe la data ya parseada del
// body POST del bot y devuelve string lista para enviar.
//
// Convenciones de emojis:
//   ⚡ TRADE_OPENED
//   📈 SL_MOVED
//   ✅ TRADE_CLOSED ganador
//   ❌ TRADE_CLOSED perdedor
//   ⚠️ alerta informativa
//   🚨 evento crítico (daily loss)
//   🛑 kill switch

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const safe = (v: unknown): string => escapeHtml(String(v ?? ""));
const num = (v: unknown, digits = 5): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "?";
};
const num2 = (v: unknown) => num(v, 2);

// ======== TRADE_OPENED ========
export type TradeOpenedPayload = {
  mt5Ticket: number | string;
  pair: string;
  direction: "LONG" | "SHORT";
  qualityRating?: string | null;
  qualityScore?: number;
  biasHTF?: string | null;
  killzone?: string | null;
  entryPrice: number;
  stopLoss: number;
  positionSize: number;
  riskPercent: number;
  riskUSD: number;
  confluences?: string[];
};

export function formatTradeOpened(t: TradeOpenedPayload): string {
  const slPips = Math.abs(
    ((t.entryPrice - t.stopLoss) /
      (Math.abs(t.entryPrice) >= 50 ? 0.01 : 0.0001))
  );
  const dirEmoji = t.direction === "SHORT" ? "🔻" : "🔺";
  const conf = (t.confluences ?? []).map(safe).join(", ");

  return [
    `⚡ <b>TRADE ABIERTO</b>`,
    `${dirEmoji} <b>${safe(t.pair)} ${safe(t.direction)}</b>` +
      (t.qualityRating
        ? ` | Calidad: <b>${safe(t.qualityRating)}</b>` +
          (t.qualityScore != null ? ` (${t.qualityScore}/10)` : "")
        : ""),
    t.biasHTF ? `<i>Bias HTF</i>: ${safe(t.biasHTF)}` : "",
    t.killzone ? `<i>Killzone</i>: ${safe(t.killzone)}` : "",
    conf ? `<i>Confluencias</i>: ${conf}` : "",
    ``,
    `📍 Entry: <code>${num(t.entryPrice)}</code>`,
    `🛑 SL: <code>${num(t.stopLoss)}</code> (${slPips.toFixed(1)} pips)`,
    `💰 Lotes: <code>${num2(t.positionSize)}</code> | Riesgo: $${num2(t.riskUSD)} (${num2(t.riskPercent)}%)`,
    `🎫 Ticket: <code>${safe(t.mt5Ticket)}</code>`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ======== SL_MOVED ========
export type SlMovedPayload = {
  mt5Ticket: number | string;
  pair: string;
  newSL: number;
  rLevelReached: number;
};

export function formatSLMoved(e: SlMovedPayload): string {
  const ref =
    e.rLevelReached === 1
      ? "<b>BE + buffer</b>"
      : `<b>${e.rLevelReached - 1}R + buffer</b>`;
  return [
    `📈 <b>SL movido</b>`,
    `${safe(e.pair)} | <code>${safe(e.mt5Ticket)}</code>`,
    `Alcanzó <b>${e.rLevelReached}R</b> → SL ahora en ${ref}`,
    `Nuevo SL: <code>${num(e.newSL)}</code>`,
  ].join("\n");
}

// ======== TRADE_CLOSED ========
export type TradeClosedPayload = {
  mt5Ticket: number | string;
  pair: string;
  closePrice: number;
  pnlUSD: number;
  rAchieved?: number;
  closeReason: string;
};

const CLOSE_REASON_LABEL: Record<string, string> = {
  SL_HIT: "SL Hit",
  CHOCH_CONTRARY: "CHoCH contrario M5",
  NEWS_HIGH: "Noticia HIGH inminente",
  KILL_SWITCH: "Kill switch",
  FRIDAY_FORCE: "Cierre forzado viernes 16:00 NY",
  MANUAL: "Cierre manual",
};

export function formatTradeClosed(t: TradeClosedPayload): string {
  const isWinner = t.pnlUSD > 0;
  const emoji = isWinner ? "✅" : "❌";
  const sign = isWinner ? "+" : "";
  const rTxt =
    t.rAchieved != null && Number.isFinite(t.rAchieved)
      ? `${sign}${t.rAchieved.toFixed(2)}R = `
      : "";
  const reasonLabel = CLOSE_REASON_LABEL[t.closeReason] ?? t.closeReason;

  return [
    `${emoji} <b>TRADE CERRADO</b>`,
    `${safe(t.pair)} | <code>${safe(t.mt5Ticket)}</code>`,
    `Resultado: <b>${rTxt}${sign}$${t.pnlUSD.toFixed(2)}</b>`,
    `Razón: <i>${safe(reasonLabel)}</i>`,
    `Precio cierre: <code>${num(t.closePrice)}</code>`,
  ].join("\n");
}

// ======== SETUP_REJECTED (solo HIGH) ========
export type SetupRejectedPayload = {
  pair: string;
  direction?: string;
  qualityRating?: string;
  qualityScore?: number;
  rejectionReason: string;
};

export function formatSetupRejectedHigh(s: SetupRejectedPayload): string {
  return [
    `⚠️ <b>Setup HIGH rechazado</b>`,
    `${safe(s.pair)} ${safe(s.direction ?? "?")}` +
      (s.qualityScore != null ? ` | Score ${s.qualityScore}/10` : ""),
    `Razón: <i>${safe(s.rejectionReason)}</i>`,
    `<i>(no operado)</i>`,
  ].join("\n");
}

// ======== KILL_SWITCH activado por user (desde la web) ========
export function formatKillSwitchActivated(): string {
  return [
    `🛑 <b>KILL SWITCH ACTIVADO</b>`,
    `Bot dormido. Cerrando todas las posiciones y cancelando pendings.`,
  ].join("\n");
}

export function formatKillSwitchDeactivated(): string {
  return [
    `✅ <b>Kill switch desactivado</b>`,
    `Bot vuelve a operación normal.`,
  ].join("\n");
}

// ======== Stubs para eventos NO emitidos por el bot V1 (TODO V2) ========
// El bot MT5 actualmente NO envía estos eventos al journal; quedan documentados
// para cuando se agreguen al loop del bot.
export function formatDailyLossReached(): string {
  return [
    `🚨 <b>DAILY LOSS ALCANZADO</b>`,
    `Bot pausado hasta 07:00 NY del próximo día.`,
    `Posiciones abiertas siguen su curso normal.`,
  ].join("\n");
}

export function formatNewsEndpointFailure(hoursWithoutFetch: number): string {
  return [
    `⚠️ <b>Endpoint de noticias caído</b>`,
    `Modo conservador activo. Sin nuevas entradas hasta que vuelva.`,
    `Última actualización: hace ${hoursWithoutFetch}h.`,
  ].join("\n");
}
