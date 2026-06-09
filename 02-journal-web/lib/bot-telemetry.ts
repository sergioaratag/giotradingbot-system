// Fase 1.4 — Telemetria estructurada de los endpoints del bot.
//
// Emite una linea JSON por request a los endpoints /api/bot/*. Aparece en los
// logs de Vercel (Functions). Sirve para diagnosticar a futuro si el bot esta
// llegando, con que auth y con que resultado — sin tener que adivinar.
//
// NO reemplaza a BotEvent (que es la auditoria de negocio en BD). Esto es solo
// observabilidad de transporte/HTTP.

export type BotRequestResult =
  | "success"
  | "auth_failed"
  | "validation_failed"
  | "db_error"
  | "duplicate";

export function logBotRequest(entry: {
  endpoint: string;
  authOk: boolean;
  result: BotRequestResult;
  payload?: Record<string, unknown>;
}): void {
  // Una sola linea JSON => parseable en los logs de Vercel.
  console.log(
    JSON.stringify({
      kind: "bot_request",
      timestamp: new Date().toISOString(),
      ...entry,
    }),
  );
}
