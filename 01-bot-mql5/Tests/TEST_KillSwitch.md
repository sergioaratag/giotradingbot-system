# TEST - Módulo Kill Switch (Módulo 12)

Polling al journal Vercel cada 30s. Si el flag remoto está ON, cierra todo lo del bot y duerme. Fail-open ante errores de red.

## Endpoint consumido

```
GET https://giotradingbot-system.vercel.app/api/bot/kill-switch
Header: x-bot-api-key: <BOT_API_KEY>
Response 200: { "killSwitch": bool, "botEnabled": bool }
Response 401: { "error": "Unauthorized" }
```

El endpoint ya existía en el journal (`02-journal-web/app/api/bot/kill-switch/route.ts`) — **no se modificó nada del journal**.

## Política de dos flags

El endpoint expone DOS flags. El bot trata cualquiera como kill switch:

| `killSwitch` | `botEnabled` | Estado bot      | `activeReason`  |
|--------------|--------------|-----------------|-----------------|
| `false`      | `true`       | OPERANDO normal | (vacío)         |
| `true`       | cualquiera   | DORMIDO         | `KILL_SWITCH`   |
| `false`      | `false`      | DORMIDO         | `BOT_DISABLED`  |

(Sergio: si NO querés que `botEnabled=false` dispare el cierre forzado y prefieras tratarlo como "solo bloquear nuevas entradas", avisame y lo separo en dos comportamientos.)

## Setup operacional

1. Verificar que la env var `BOT_API_KEY` está en Vercel (la misma usada para Módulo 11).
2. MT5: URL `https://giotradingbot-system.vercel.app` autorizada (mismo allowlist que Módulo 11).
3. Input `BotApiKey` configurado en el EA.
4. Probar manualmente:
   ```
   curl -H "x-bot-api-key: <KEY>" https://giotradingbot-system.vercel.app/api/bot/kill-switch
   # → {"killSwitch":false,"botEnabled":true}
   ```

## Qué debería verse en logs

### Polling normal (silencioso)
Sin logs mientras el estado no cambia. El módulo NO loggea polls exitosos OFF.

### Activación detectada
```
==========================================
[KILLSWITCH] ACTIVADO REMOTAMENTE | razon=KILL_SWITCH | cerrando posiciones y cancelando pendings
==========================================
[KILLSWITCH] Cerrada posicion ticket=12345 | EURUSD
[KILLSWITCH] Cerrada posicion ticket=12346 | GBPUSD
[KILLSWITCH] Cancelado pending ticket=12347
[KILLSWITCH] Protocolo de emergencia ejecutado: 2 posiciones cerradas, 1 pendings cancelados.
```

### Intento de apertura mientras está activo
```
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Kill switch ACTIVO (KILL_SWITCH) - operacion bloqueada
```

### Desactivación
```
[KILLSWITCH] DESACTIVADO | bot vuelve a operacion normal
```

### Fail-open (endpoint caído)
```
[KILLSWITCH] Endpoint retorno HTTP 503 | body[0..120]=... | fail-open: bot sigue operando
```
o
```
[KILLSWITCH] WebRequest fallo. Error: 5203 | fail-open: bot sigue operando
```

### Sin URL autorizada
```
[KILLSWITCH] WebRequest fallo. Error: 4060 - URL no autorizada en MT5 (Tools > Options > Expert Advisors) | fail-open: bot sigue operando
```

## Validaciones

1. **Detección ≤30s**: cambiar `killSwitch` a `true` desde la web → bot reacciona en máximo 30 segundos.
2. **Cierre solo de trades del bot**: trades manuales del usuario (Magic ≠ 871234) **no** se cierran ni cancelan.
3. **Idempotencia**: con kill switch ON, los polls subsiguientes NO repiten el cierre masivo (`enforcementDone=true`).
4. **Reactivación**: OFF → ON → OFF → ON → segundo enforcement se ejecuta (flag se resetea al volver a OFF).
5. **Fail-open en timeout**: simular 503/timeout → bot sigue operando, mantiene el último estado conocido.
6. **Fail-open en 4060**: sin URL autorizada → bot sigue operando, alerta visible en log.
7. **Bloqueo en Execution**: con kill switch ON, un setup confirmado se rechaza con `REJECTED_FILTER` razón "Kill switch ACTIVO".
8. **Bloqueo en OnTick**: con kill switch ON, `Management_Process`, `Setup_Process`, `Liquidity_Update` NO corren (early return).
9. **BotApiKey vacío**: log al iniciar, poll abortado sin WebRequest (no llena logs con errores 401).

## Caso completo de prueba

| Tiempo | Acción                                | Resultado esperado                        |
|--------|---------------------------------------|-------------------------------------------|
| T=0s   | Bot operando con 1 posición + 1 pending | Normal                                  |
| T=10s  | Usuario activa kill switch (POST al endpoint) | (pendiente próximo poll)            |
| T=30s  | Bot poll: detecta `killSwitch=true`   | Cierre forzado: 1 posición + 1 pending    |
| T=45s  | Setup HIGH confirmado                 | Execution: REJECTED_FILTER (kill switch)  |
| T=60s  | Otro poll                             | Sin acción (enforcementDone)              |
| T=120s | Usuario desactiva kill switch         | (pendiente próximo poll)                  |
| T=150s | Bot poll: detecta `killSwitch=false`  | Log "DESACTIVADO" + reset enforcementDone |
| T=180s | Nuevo setup HIGH confirmado           | Procesado normal                          |

## Notas técnicas

- **WebRequest timeout 3s** (menor que el de News=5s) para no congelar OnTick mucho tiempo si Vercel está degradado.
- **Polling sin spam**: solo se loggea en transiciones de estado y en errores de red. Polls exitosos OFF son silenciosos.
- **Sin dependencia de News.mqh** — KillSwitch es standalone para evitar circular dependencies (lo único que requiere es la API key y el endpoint).
- **`KillSwitch_IsActive()` se evalúa también en `Execution_OpenFromSizing`** (defensa en profundidad). El early return en OnTick ya bloquea todo lo upstream, pero si alguien llama directamente a Execution_OpenFromSizing, igual se respeta.
- **Reinicio del EA con kill switch ON**: en `OnInit` se hace poll + EnforceIfActive sincronizadamente. Si la BD del journal dice ON, el bot arranca dormido.
- **Sin retry inmediato**: si un poll falla, esperamos 30s al siguiente. No reintentamos en intervalos cortos para no spammear el endpoint en caída de Vercel.
