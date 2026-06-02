# TEST - Módulo 14 - Telegram Alerts

Notificaciones a Telegram disparadas desde los endpoints del journal Vercel. **Cero cambios en el bot MT5** — todo el trabajo está en `02-journal-web/`.

## Setup operacional

### En Telegram (hecho por Sergio)
1. ✅ Crear bot con `@BotFather` → obtener `TELEGRAM_BOT_TOKEN`.
2. ✅ Obtener `TELEGRAM_CHAT_ID` con `@userinfobot` (o `@RawDataBot`).
3. ✅ Iniciar chat con el bot (apretar `/start` una vez) — sin esto Telegram no entrega mensajes.

### En Vercel (hecho por Sergio)
1. ✅ Project → Settings → Environment Variables:
   - `TELEGRAM_BOT_TOKEN` = `<TOKEN>`
   - `TELEGRAM_CHAT_ID`   = `<CHAT_ID>`
2. ✅ Aplicar a Production + Preview + Development.
3. ✅ Redeploy del journal-web (sin esto las env vars no se cargan).

### En local (para correr el smoke test)
- Copiar las mismas dos env vars al archivo `.env` local.

## Cómo probar

### Test 1 — Smoke test básico
```bash
cd 02-journal-web
npx tsx scripts/test-telegram.ts
```
Resultado esperado: un mensaje "🤖 Test desde GioTradingBot" en el chat de Telegram.

### Test 2 — Muestras de los 5 tipos
```bash
npx tsx scripts/test-telegram.ts --all
```
Envía un ejemplo de cada formato: TRADE_OPENED, SL_MOVED, TRADE_CLOSED ganador, TRADE_CLOSED perdedor grande, SETUP_REJECTED HIGH, KILL_SWITCH activado.

### Test 3 — End-to-end vía endpoint (simula un POST del bot)
```bash
curl -X POST https://giotradingbot-system.vercel.app/api/bot/trade \
  -H "x-bot-api-key: $BOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mt5Ticket": 99999,
    "pair": "EURUSD",
    "direction": "SHORT",
    "entryPrice": 1.0844,
    "stopLoss": 1.0860,
    "positionSize": 0.85,
    "riskPercent": 1.5,
    "riskUSD": 127.50,
    "qualityRating": "HIGH",
    "biasHTF": "BEARISH",
    "killzone": "NY_AM",
    "confluences": ["SWEEP_H1_LIQ_LDN_H","FVG_M5","CHOCH_M5","BIAS_ALIGNED"]
  }'
```
Resultado esperado: response `{ ok: true, tradeId: "...", mt5Ticket: 99999 }` rápido (~200ms) + mensaje "⚡ TRADE ABIERTO" en Telegram.

## Política de sonido

| Evento                                  | `silent`                     | Por qué                          |
|-----------------------------------------|------------------------------|----------------------------------|
| TRADE_OPENED                            | `false` (con sonido)         | Quiero verlo aunque esté afk     |
| SL_MOVED                                | `true` (silencio)            | Informativo, no urgente          |
| TRADE_CLOSED ganador o pérdida ≤ $50    | `true` (silencio)            | Resultado esperado               |
| TRADE_CLOSED pérdida > $50              | `false` (con sonido)         | Pérdida grande, atención         |
| SETUP_REJECTED quality=HIGH             | `true` (silencio)            | Solo info para auditar           |
| SETUP_REJECTED quality=MEDIUM/LOW       | (no se envía)                | Spam evitado                     |
| KILL_SWITCH activado por user           | `false` (con sonido)         | Evento crítico                   |
| KILL_SWITCH desactivado por user        | `true` (silencio)            | Restauración a normal            |

## Cobertura por endpoint

| Endpoint                              | Hook Telegram | Sonido condicional                      |
|---------------------------------------|---------------|-----------------------------------------|
| `POST /api/bot/trade`                 | ✅            | siempre                                 |
| `POST /api/bot/trade/sl-moved`        | ✅            | nunca (silent siempre)                  |
| `POST /api/bot/trade/closed`          | ✅            | si `pnlUSD < -50`                       |
| `POST /api/bot/setup-rejected`        | ✅            | solo si `qualityRating === "HIGH"`      |
| `POST /api/bot/kill-switch` (user)    | ✅            | sonido al activar, silencio al desactivar |

## Validaciones

1. **HTML render correcto**: `<b>`, `<i>`, `<code>` se ven formateados en Telegram, no como texto literal.
2. **Fire-and-forget**: `sendTelegram` se llama con `.catch(...)` SIN `await`. Si Telegram tarda, el POST del bot recibe respuesta igual rápido. Verificable midiendo latencia del endpoint.
3. **Telegram caído no rompe journal**: si la API de Telegram timeout (5s), el handler captura `AbortError`, loggea console.error y sigue. La Trade row se creó OK.
4. **Env vars faltantes**: si `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID` no están, `sendTelegram` retorna `false` con `console.warn`. El journal sigue funcionando normal.
5. **Filtrado SETUP_REJECTED**: simular un setup rechazado con `qualityRating="MEDIUM"` → NO debe llegar mensaje. Con `"HIGH"` → sí.
6. **Web preview deshabilitado**: `disable_web_page_preview: true` evita que Telegram intente expandir URLs si aparecen en el texto.
7. **HTML escape**: caracteres `&`, `<`, `>` en valores (ej. comments) se escapan antes de meterse en tags.

## Edge cases NO cubiertos (TODO V2)

- **DAILY_LOSS_REACHED**: el bot MT5 actualmente NO emite un evento dedicado cuando `Execution_IsDailyLossExceeded()` dispara — solo rechaza setups con razón "Daily loss alcanzado". Eso llega como `SETUP_REJECTED`, así que se notifica solo si el setup rechazado era HIGH. Para una alerta dedicada, agregar un POST específico desde el bot.
- **NEWS_ENDPOINT_FAILURE**: el bot loggea localmente cuando el endpoint de noticias falla pero NO envía al journal. Sin notificación a Telegram. Requiere cambio en el bot MQL5.
- **TRADE_OPENED Limit pendiente vs. ejecutado**: el endpoint actual recibe el POST cuando se envía la orden Limit, no cuando se ejecuta. El mensaje llega antes de que el broker llene la orden. Aceptable para V1.
- **Rate limit de Telegram**: ~30 msg/seg por bot. Con ~7 mensajes por trade × 5 trades/día = 35 mensajes/día. Muy lejos del límite.
- **Múltiples chat_ids**: solo se envía a un chat. Si querés que llegue a un grupo Y a vos, el bot debe estar en el grupo y mandar a 2 chats — extender helper.

## Arquitectura

```
Bot MT5 (Windows VPS)
   │
   │ HTTPS POST x-bot-api-key
   ↓
Journal Vercel  ──► Prisma (BD)
   │
   │ fire-and-forget (sin await)
   ↓
Telegram Bot API
   │
   ↓
Sergio's phone 📱
```

Latencia del bot al recibir respuesta: ~200ms (depende solo de la operación Prisma; Telegram corre en paralelo).
