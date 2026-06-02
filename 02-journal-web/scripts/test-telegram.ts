import "dotenv/config";
import { sendTelegram } from "../lib/telegram";
import {
  formatTradeOpened,
  formatSLMoved,
  formatTradeClosed,
  formatSetupRejectedHigh,
  formatKillSwitchActivated,
} from "../lib/telegram-messages";

// Smoke test del modulo 14 Telegram.
// Uso:
//   npx tsx scripts/test-telegram.ts
//   npx tsx scripts/test-telegram.ts --all   (envia los 5 tipos de mensaje)
async function main() {
  const wantAll = process.argv.includes("--all");

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error(
      "❌ TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no estan en el .env local",
    );
    process.exit(1);
  }

  console.log("Probando envio basico...");
  const ok = await sendTelegram(
    "🤖 <b>Test desde GioTradingBot</b>\n\n" +
      "Si ves este mensaje, Telegram esta conectado correctamente.\n" +
      `<i>Timestamp: ${new Date().toISOString()}</i>`,
    { silent: false },
  );
  console.log(ok ? "✅ Test basico enviado" : "❌ Fallo envio basico");

  if (!wantAll) return;

  console.log("\nEnviando muestras de los 5 tipos...");

  await sendTelegram(
    formatTradeOpened({
      mt5Ticket: 99001,
      pair: "EURUSD",
      direction: "SHORT",
      qualityRating: "HIGH",
      qualityScore: 9,
      biasHTF: "BEARISH",
      killzone: "NY_AM",
      entryPrice: 1.0844,
      stopLoss: 1.086,
      positionSize: 0.85,
      riskPercent: 1.5,
      riskUSD: 127.5,
      confluences: ["SWEEP_H1_LIQ_LDN_H", "FVG_M5", "CHOCH_M5", "BIAS_ALIGNED"],
    }),
    { silent: false },
  );

  await sendTelegram(
    formatSLMoved({
      mt5Ticket: 99001,
      pair: "EURUSD",
      newSL: 1.0828,
      rLevelReached: 2,
    }),
    { silent: true },
  );

  await sendTelegram(
    formatTradeClosed({
      mt5Ticket: 99001,
      pair: "EURUSD",
      closePrice: 1.078,
      pnlUSD: 220.5,
      rAchieved: 2.5,
      closeReason: "SL_HIT",
    }),
    { silent: true },
  );

  await sendTelegram(
    formatTradeClosed({
      mt5Ticket: 99002,
      pair: "GBPUSD",
      closePrice: 1.2585,
      pnlUSD: -87.5,
      rAchieved: -1.0,
      closeReason: "SL_HIT",
    }),
    { silent: false }, // pérdida >$50 => sonido
  );

  await sendTelegram(
    formatSetupRejectedHigh({
      pair: "EURUSD",
      direction: "SHORT",
      qualityRating: "HIGH",
      qualityScore: 9,
      rejectionReason: "Noticia HIGH dentro de ventana +/-30 min",
    }),
    { silent: true },
  );

  await sendTelegram(formatKillSwitchActivated(), { silent: false });

  console.log("✅ Muestras enviadas.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
