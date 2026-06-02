// Helper para enviar mensajes a Telegram desde los endpoints del journal.
// Fire-and-forget: los hooks usan `.catch(console.error)` SIN await para no
// bloquear la respuesta al bot MT5 (que tiene timeout corto en WebRequest).
//
// Variables de entorno requeridas en Vercel:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
// Si faltan, sendTelegram retorna false con un warn y el journal sigue normal.

const TELEGRAM_API_TIMEOUT_MS = 5_000;

export type SendOptions = {
  /** disable_notification: true = sin sonido en el dispositivo */
  silent?: boolean;
  /** HTML por default (tags <b>/<i>/<code>) */
  parseMode?: "HTML" | "MarkdownV2";
};

export async function sendTelegram(
  message: string,
  options: SendOptions = {},
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados, skip",
    );
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TELEGRAM_API_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: options.parseMode ?? "HTML",
          disable_notification: options.silent ?? false,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const error = await response.text().catch(() => "<no body>");
      console.error("[telegram] send failed:", response.status, error);
      return false;
    }
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      console.error("[telegram] timeout after", TELEGRAM_API_TIMEOUT_MS, "ms");
    } else {
      console.error("[telegram] error sending:", err);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
