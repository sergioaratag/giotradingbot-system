# TEST - Módulo News (Módulo 11)

Cliente HTTP del calendario de noticias del journal Vercel. Refresca cache 1×/hora y consultas son in-memory (instantáneas).

## Setup obligatorio antes de testear

### En el journal (02-journal-web)
1. Crear variable de entorno `BOT_API_KEY` en Vercel (dashboard → settings → env vars).
   - Generar valor random fuerte (ej: `openssl rand -hex 32`).
   - Aplicar a Production + Preview + Development.
2. Redeploy del journal-web para que la env var se cargue.
3. Verificar manualmente:
   ```
   curl -H "x-bot-api-key: <YOUR_KEY>" https://giotradingbot-system.vercel.app/api/news/bot-today
   ```
   - Debe devolver `200` con JSON de eventos.
   - Sin header → `401`.
   - Header incorrecto → `401`.

### En MT5
1. `Tools` → `Options` → `Expert Advisors` → **Allow WebRequest for listed URL**.
2. Agregar: `https://giotradingbot-system.vercel.app`.
3. Click `OK`.
4. Al cargar GioBot, configurar el input `BotApiKey` con el valor de la env var del journal.

## Qué debería verse en logs

### Fetch exitoso (al iniciar y cada hora)
```
[NEWS] Cache actualizada. 7 eventos cargados.
```

### Fetch fallido: URL no autorizada en MT5
```
[NEWS] WebRequest fallo. Error: 4060 - URL no autorizada en MT5 (Tools > Options > Expert Advisors)
```

### Fetch fallido: API key inválida / faltante
```
[NEWS] Endpoint retorno HTTP 401 | body[0..200]={"error":"Unauthorized"}
```

### Fetch fallido: BOT_API_KEY no configurada en el server
```
[NEWS] Endpoint retorno HTTP 503 | body[0..200]={"error":"BOT_API_KEY not configured on server"}
```

### Input BotApiKey vacío al iniciar
```
[NEWS] Fetch abortado: BotApiKey no configurado (input vacio).
[WARN] Input BotApiKey vacio - News fetch fallara. Configurar antes de operar.
```

### Filters bloqueando por cache no confiable (modo conservador)
```
[FILTERS] REJECTED | EURUSD | Calendario de noticias no confiable (cache vencida o nunca fetched) - modo conservador | Spread: 0.50 pips | ATR(14) H1: 12.40 pips
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Calendario de noticias no confiable (cache vencida o nunca fetched) - modo conservador
```

### Filters bloqueando por ventana de noticia
```
[FILTERS] REJECTED | EURUSD | Noticia HIGH dentro de ventana +/-30 min | Spread: 0.50 pips | ATR(14) H1: 12.40 pips
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Noticia HIGH dentro de ventana +/-30 min
```

### Management cerrando 5 min antes de noticia
```
[MGMT] CLOSED_BY_NEWS | Ticket: 12345 | SL en BE+, cerrado por noticia HIGH inminente
```

## Validaciones

1. **URL autorizada en MT5**: sin esto cualquier `WebRequest` retorna -1 con `GetLastError()==4060`. Validar manualmente que el host está en la whitelist.
2. **BotApiKey configurado**: input no vacío. Si está vacío, `News_FetchFromApi()` aborta sin hacer la request.
3. **Fetch cada hora**: tras un fetch OK, los siguientes 59 minutos no debe haber otra request. Tras pasar 1h, se vuelve a intentar.
4. **Cache 12h máx**: si pasan 12h sin fetch OK consecutivo, `News_CanQueryReliably()` retorna false → Filters bloquea en modo conservador.
5. **Bloqueo por ventana ±30 min**: con `BLOCK_WINDOW_MIN=30` (server-side), NFP USD a las 13:30 UTC bloquea cualquier nueva entrada en EURUSD/GBPUSD entre 13:00 y 14:00 UTC.
6. **Currency relevante**: noticia HIGH JPY no bloquea EURUSD ni GBPUSD (solo USD/EUR para EURUSD, USD/GBP para GBPUSD).
7. **Server-side `isActive` no usado directamente**: el cliente recomputa la ventana localmente para que la lógica sea consistente con el reloj local del MT5 (UTC). Server-side `isActive` queda en el struct como referencia, pero las funciones operan sobre `scheduledAt`.
8. **Cierre 5 min antes con SL en BE+**: si `News_IsHighImpactSoon(symbol, 5)` true Y `currentSL` está en BE o mejor → Management cierra. Si SL en pérdida, deja correr.
9. **Cache no confiable bloquea apertura pero NO fuerza cierre**: si `News_CanQueryReliably()` false, `Management_ShouldCloseByNews` retorna false (no cerrar sin datos), pero `Filters_CheckEntry` rechaza (no abrir sin datos).

## Tabla de comportamiento

| Estado News                  | Filters (nueva entrada) | Management (cerrar BE+) |
|------------------------------|-------------------------|-------------------------|
| Cache OK, sin eventos en ventana | OK                  | NO cierra               |
| Cache OK, evento HIGH ±30 min    | REJECTED (ventana)  | NO cierra (no es ≤5 min) |
| Cache OK, evento HIGH ≤5 min     | REJECTED (ventana)  | CIERRA si SL en BE+     |
| Cache vencida (>12h)             | REJECTED (conservador) | NO cierra (modo seguro) |
| Cache nunca pobló (fetch nunca OK) | REJECTED (conservador) | NO cierra              |

## Parser JSON

Parser manual con `StringFind`/`StringSubstr` y tracking de profundidad de `{...}` para no confundir objetos anidados ni arrays internos. Frágil ante cambios de shape — si el endpoint cambia `events` por otro nombre, `scheduledAt` por otro key, o el formato ISO cambia, el parser rompe silenciosamente (el log mostrará `Parseo del JSON fallo`).

Shape esperado (subconjunto leído):
```json
{
  "events": [
    {
      "id": "ff_123",
      "title": "Non-Farm Payrolls",
      "currency": "USD",
      "impact": "HIGH",
      "scheduledAt": "2026-01-05T13:30:00.000Z",
      "isActive": false,
      "isBlocked": false,
      "hasPassed": false,
      "isUpcoming": true
    }
  ]
}
```

Campos `activeBlock`, `nextEvent`, `now`, `nyDate` son ignorados — el cliente recomputa sus propias ventanas.

## Notas técnicas

- `WebRequest` bloquea hasta `NEWS_WEBREQUEST_TIMEOUT_MS=5000`. Por eso solo se llama 1× cada hora desde `News_TickUpdate`, nunca en cada tick.
- Toda la lógica de "ventana" usa `TimeGMT()` localmente para comparar contra `scheduledAt` (ya UTC). No usar `TimeCurrent()` (server time del broker).
- `News_HasHighImpactInWindow(symbol, mins)`: ventana ± minutos alrededor del ahora (para Filters_CheckEntry).
- `News_IsHighImpactSoon(symbol, mins)`: solo "antes" (0..+mins desde el ahora). Para Management.
- Si Sergio rota la `BOT_API_KEY` en el journal, hay que actualizar también el input `BotApiKey` en el EA y reiniciarlo.
