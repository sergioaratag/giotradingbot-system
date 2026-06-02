# TEST - Módulo Journal (Módulo 13)

POST de eventos del bot al journal Vercel. Fire-and-forget: cualquier fallo loggea warning pero el bot sigue operando.

## Endpoints consumidos

| Evento           | Método | URL                                | Side effects                                      |
|------------------|--------|------------------------------------|---------------------------------------------------|
| TRADE_OPENED     | POST   | `/api/bot/trade`                   | Crea Trade row (con `mt5Ticket`) + TradeConfluence|
| TRADE_SL_MOVED   | POST   | `/api/bot/trade/sl-moved`          | Update Trade.stopLoss + Trade.beHit + BotEvent     |
| TRADE_CLOSED     | POST   | `/api/bot/trade/closed`            | Update Trade.exitPrice/exitTime/pnlUSD/rAchieved + BotEvent |
| SETUP_REJECTED   | POST   | `/api/bot/setup-rejected`          | Crea BotEvent (no toca Trade)                     |

Todos usan auth `x-bot-api-key`. Schema requirements:
- `Trade.mt5Ticket Int? @unique` (migration `20260602120000_add_mt5_ticket_and_kz_sessions`)
- `SessionType` enum extendido con `LONDON_KZ` y `NY_LUNCH`

## Setup operacional (CRÍTICO)

1. **Migration en Vercel**: tras pushear, correr `prisma migrate deploy` o reaplicar en local con `prisma migrate dev`. **Sin esto, `mt5Ticket` no existe y todos los POSTs fallan con 500.**
2. URL ya autorizada en MT5 desde Módulos 11/12: `https://giotradingbot-system.vercel.app`.
3. Input `BotApiKey` ya configurado.
4. Test manual:
   ```bash
   curl -X POST -H "x-bot-api-key: <KEY>" -H "Content-Type: application/json" \
        -d '{"mt5Ticket":99,"pair":"EURUSD","direction":"LONG","entryPrice":1.08,"stopLoss":1.075,"positionSize":0.1,"riskPercent":0.5,"riskUSD":50}' \
        https://giotradingbot-system.vercel.app/api/bot/trade
   # → {"ok":true,"tradeId":"...","mt5Ticket":99}
   ```

## Naming mapping (MQL5 → journal)

| MQL5 field             | Journal field      |
|------------------------|--------------------|
| `setup.symbol`         | `pair`             |
| `exec.lots`            | `positionSize`     |
| `sizing.slPrice`       | `stopLoss`         |
| `exec.ticket` (ulong)  | `mt5Ticket` (int)  |
| `sizing.riskEffectivePct` | `riskPercent`   |
| `setup.quality`        | `qualityRating`    |
| `setup.bias.bias`      | `biasHTF`          |
| `exec.comment`         | `preTradeNotes`    |

## Qué debería verse en logs

### Trade abierto + posteado
```
======= EXECUTION OK =======
[EXECUTION] MARKET SHORT | EURUSD | Ticket: 12345 | Lotes: 0.85
[JOURNAL] TRADE_OPENED enviado | Ticket: 12345 | EURUSD
```

### SL movido + posteado
```
[MGMT] SL_MOVED | Ticket: 12345 | Alcanzo 1R. SL movido a BE + buffer (1.08439)
[JOURNAL] SL_MOVED enviado | Ticket: 12345 | R=1
```

### Trade cerrado (SL hit detectado por housekeeping) + posteado
```
[MGMT] CLOSED | Ticket: 12345 | Posicion ya no existe (SL hit / cierre externo)
[JOURNAL] TRADE_CLOSED enviado | Ticket: 12345 | Reason: SL_HIT | PnL: -150.00
```

### Trade cerrado por CHoCH + posteado
```
[MGMT] CLOSED_BY_CHOCH | Ticket: 12345 | CHoCH contrario detectado en M5
[JOURNAL] TRADE_CLOSED enviado | Ticket: 12345 | Reason: CHOCH_CONTRARY | PnL: +45.20
```

### Trade cerrado por kill switch + posteado
```
[KILLSWITCH] Cerrada posicion ticket=12345 | EURUSD
[JOURNAL] TRADE_CLOSED enviado | Ticket: 12345 | Reason: KILL_SWITCH | PnL: -23.10
```

### Trade cerrado por viernes 16:00 NY + posteado
```
[FILTERS] Cierre forzado viernes 16:00 NY | Ticket: 12345 | EURUSD
[JOURNAL] TRADE_CLOSED enviado | Ticket: 12345 | Reason: FRIDAY_FORCE | PnL: +12.40
```

### Setup rechazado por filtro + posteado
```
[FILTERS] REJECTED | EURUSD | Spread 2.10 pips > maximo 1.50 pips ...
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Spread 2.10 pips > maximo 1.50 pips
[JOURNAL] SETUP_REJECTED enviado | EURUSD | Razon: Spread 2.10 pips > maximo 1.50 pips
```

### POST fallido (fire-and-forget)
```
[JOURNAL] TRADE_OPENED POST fallo. Error: 4060 - URL no autorizada en MT5 ...
[JOURNAL] TRADE_OPENED HTTP 500 | body[0..160]=...
```
**El bot sigue operando**, el evento se pierde para la web pero el trade vive en MT5 y aparecerá igual en el historial del broker.

## Patrón closeReported

Para evitar doble-posteo cuando el bot cierra explícitamente:

1. Antes de `trade.PositionClose(ticket)`, el módulo que cierra (Management/CHoCH, Management/news, KillSwitch, Filters/viernes) llama `Management_MarkCloseReported(ticket, reason)` que setea el flag en s_positions.
2. Inmediatamente después del cierre exitoso, el mismo módulo postea `Journal_PostTradeClosed` con la razón correcta.
3. En el siguiente tick, `Management_PurgeClosedTickets()` detecta que el ticket ya no existe en MT5; como `closeReported=true`, NO postea de nuevo.
4. Si el cierre falla (PositionClose returns false), el módulo revierte `closeReported=false` para que el housekeeping reintente postear en el próximo tick (con razón SL_HIT por default si no estaba marcado).
5. Cierres externos (SL hit del broker, cierre manual desde MT5 UI): `closeReported=false` siempre. El housekeeping postea con la razón guardada por default = `CLOSE_REASON_SL_HIT`.

## Validaciones

1. **Migration aplicada**: `Trade.mt5Ticket` debe existir; el endpoint /api/bot/trade rechaza con 500 si no.
2. **TRADE_OPENED crea Trade row**: abrir un trade demo y comprobar que aparece en `https://giotradingbot-system.vercel.app/trades` con `source=BOT` y `mt5Ticket` poblado.
3. **Confluencias en el detalle**: el Trade debe tener `TradeConfluence` rows con keys tipo `SWEEP_H1_LIQ_LDN_H`, `FVG_M5`, `CHOCH_M5`, `BIAS_ALIGNED`.
4. **SL_MOVED actualiza Trade**: al alcanzar 1R, `Trade.stopLoss` se actualiza Y `Trade.beHit=true`. BotEvent type=SL_MOVED se crea con metadata.
5. **TRADE_CLOSED por SL_HIT (externo)**: cuando broker hit SL, el housekeeping detecta y postea. Trade row queda con `exitPrice`, `exitTime`, `pnlUSD`, `rAchieved`. BotEvent type=TRADE_CLOSED con `closeReason=SL_HIT`.
6. **TRADE_CLOSED por CHoCH**: Management cierra explícito; el POST sale con `closeReason=CHOCH_CONTRARY`. NO hay doble posteo en el siguiente tick.
7. **TRADE_CLOSED por kill switch**: KillSwitch_EnforceIfActive cierra masivo; cada ticket postea con `closeReason=KILL_SWITCH`.
8. **TRADE_CLOSED por viernes 16:00 NY**: Filters_EnforceFridayClosing cierra; el POST usa la variante `Journal_PostTradeClosedRaw` con string literal `"FRIDAY_FORCE"` (no está en el enum `ENUM_CLOSE_REASON` pero el endpoint lo acepta).
9. **SETUP_REJECTED por filtro/daily/risk/kill**: cada vía de rechazo dentro de Execution dispara un POST a /api/bot/setup-rejected con metadata completa. BotEvent type=SETUP_REJECTED se crea.
10. **Fire-and-forget**: si la URL no está autorizada, todos los POSTs loggean warning pero el bot sigue operando (no early-return, no excepción).
11. **Trades manuales del usuario intactos**: solo trades con `Magic == 871234` se postean.
12. **JSON escape**: comments con comillas (raro pero posible) no rompen el JSON gracias a `Journal_EscapeStr`.

## Edge cases

- **Bot reiniciado con posiciones abiertas previas**: `Management_FindOrInitIdx` siembra el state sin postear TRADE_OPENED (el journal ya tiene esa row si se posteó cuando se abrió). Si el broker cierra después, el housekeeping postea TRADE_CLOSED con `closeReason=SL_HIT` por default; la Trade row se actualizará si el journal tiene el mt5Ticket.
- **mt5Ticket no encontrado en journal**: el endpoint sl-moved/closed responde `tradeUpdated=false` pero igual crea el BotEvent (audit log nunca se pierde). Esto pasa si el TRADE_OPENED POST falló por red.
- **rAchieved=0 en KillSwitch/Filters**: estos módulos no tienen acceso al slDistance original (no consultan s_positions); pasan rAchieved=0. El pnlUSD del deal sí es exacto.
- **Trade abierto que nunca movió SL**: si broker cierra a SL hit antes del 1R, el housekeeping postea con `rAchieved=-1` (el cálculo usa entry-closePrice / slDistance).
- **Rate limit Vercel**: con ~2-5 trades por día × ~7 POSTs cada uno (open + 4-5 sl moves + close) ≈ 35 POSTs/día. Muy lejos del límite del plan free.

## Próximo módulo

Módulo 14: Telegram alerts.
