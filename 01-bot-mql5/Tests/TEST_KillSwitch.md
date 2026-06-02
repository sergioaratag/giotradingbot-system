# TEST - Módulo Kill Switch (Módulo 12)

Polling al journal Vercel cada 30s con DOS flags separados. Fail-open ante errores de red.

## Endpoint consumido

```
GET https://giotradingbot-system.vercel.app/api/bot/kill-switch
Header: x-bot-api-key: <BOT_API_KEY>
Response 200: { "killSwitch": bool, "botEnabled": bool }
Response 401: { "error": "Unauthorized" }
```

El endpoint ya existía en `02-journal-web/app/api/bot/kill-switch/route.ts` — **no se modificó nada del journal**.

## Política — DOS flags, DOS comportamientos

| `killSwitch` | `botEnabled` | Posiciones abiertas       | Pending orders         | Nuevas entradas |
|--------------|--------------|---------------------------|------------------------|-----------------|
| `false`      | `true`       | Gestionadas normal        | Activos hasta exp.     | Permitidas      |
| `false`      | `false`      | Gestionadas normal        | Activos hasta exp.     | **BLOQUEADAS**  |
| `true`       | (cualquier)  | **CERRADAS Market**       | **CANCELADOS**         | **BLOQUEADAS**  |

- **`killSwitch=true` = EMERGENCIA** (botón rojo). Dispara cierre total inmediato y duerme el bot por completo (early return en OnTick).
- **`botEnabled=false` = APAGADO PROGRESIVO**. NO cierra nada; las posiciones abiertas siguen con su gestión normal (trailing, BE, salida por CHoCH, salida por noticia). Solo bloquea aperturas. Es el "interruptor para descansar".
- **Prioridad**: si `killSwitch=true`, `botEnabled` se ignora.

## API pública

| Función                          | Retorna                                                       |
|----------------------------------|---------------------------------------------------------------|
| `KillSwitch_IsEmergency()`       | `killSwitch == true`                                          |
| `KillSwitch_IsBotEnabled()`      | `killSwitch=false && botEnabled=true`                         |
| `KillSwitch_AllowsNewEntries()`  | alias de `IsBotEnabled` — consumido por Execution             |
| `KillSwitch_IsActive()`          | alias retrocompat de `IsEmergency` (no usar en código nuevo)  |
| `KillSwitch_Poll()`              | Hace WebRequest si pasaron 30s; safe llamarlo cada tick       |
| `KillSwitch_EnforceIfActive()`   | Cierre masivo si `killSwitch=true` y no se hizo aún (idempotente) |

## Setup operacional

1. Verificar env var `BOT_API_KEY` en Vercel (la misma usada por Módulo 11).
2. MT5: URL `https://giotradingbot-system.vercel.app` autorizada (mismo allowlist).
3. Input `BotApiKey` configurado en el EA.
4. Probar manualmente:
   ```
   curl -H "x-bot-api-key: <KEY>" https://giotradingbot-system.vercel.app/api/bot/kill-switch
   # → {"killSwitch":false,"botEnabled":true}
   ```

## Qué debería verse en logs

### Polling normal (silencioso)
Polls exitosos sin cambio de estado NO producen logs.

### Emergencia activada (`killSwitch` false → true)
```
==========================================
[KILLSWITCH] EMERGENCIA ACTIVADA | cerrando todo (posiciones + pendings)
==========================================
[KILLSWITCH] Cerrada posicion ticket=12345 | EURUSD
[KILLSWITCH] Cerrada posicion ticket=12346 | GBPUSD
[KILLSWITCH] Cancelado pending ticket=12347
[KILLSWITCH] Protocolo de emergencia ejecutado: 2 posiciones cerradas, 1 pendings cancelados.
```

### Emergencia desactivada (con botEnabled=true)
```
[KILLSWITCH] Emergencia desactivada | bot vuelve a operacion normal
```

### Emergencia desactivada (pero botEnabled=false)
```
[KILLSWITCH] Emergencia desactivada | bot vuelve a operacion normal (botEnabled=false sigue bloqueando nuevas entradas)
```

### Apagado progresivo (`botEnabled` true → false)
```
[KILLSWITCH] Bot DESHABILITADO (apagado progresivo) | posiciones abiertas siguen gestion normal | no se abriran nuevas
```

### Reactivación (`botEnabled` false → true)
```
[KILLSWITCH] Bot HABILITADO | nuevas entradas permitidas
```

### Rechazo en Execution con emergencia ON
```
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Kill switch EMERGENCIA - operacion bloqueada
```

### Rechazo en Execution con botEnabled=false
```
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Bot deshabilitado (botEnabled=false) - no se abren nuevas posiciones
```

### Fail-open (endpoint caído)
```
[KILLSWITCH] Endpoint retorno HTTP 503 | body[0..120]=... | fail-open: bot sigue operando
[KILLSWITCH] WebRequest fallo. Error: 5203 | fail-open: bot sigue operando
[KILLSWITCH] WebRequest fallo. Error: 4060 - URL no autorizada en MT5 ... | fail-open: bot sigue operando
```

### JSON inesperado
```
[KILLSWITCH] JSON sin campo killSwitch | body[0..120]=... | fail-open
```

## Validaciones

1. **Detección ≤30s**: cualquier flip de cualquier flag desde la web → el bot reacciona en máximo 30 segundos.
2. **`botEnabled=false` NO cierra posiciones**: con una posición activa y `botEnabled=false`, las funciones de Management (trailing, BE, CHoCH, news) siguen ejecutándose normalmente.
3. **`botEnabled=false` SÍ bloquea nuevas**: setup confirmado → `REJECTED_FILTER` razón "Bot deshabilitado".
4. **`killSwitch=true` cierra todo**: 1 posición + 1 pending → ambos cerrados/cancelados a Market dentro del mismo tick del poll.
5. **Prioridad**: con `killSwitch=true` y `botEnabled=true` → comportamiento idéntico a emergencia (cierra todo).
6. **Idempotencia**: con killSwitch ON, los polls subsiguientes NO repiten el cierre (`enforcementDone=true`).
7. **Reactivación de emergencia**: ON → OFF → ON dispara segundo enforcement (flag se resetea al volver a OFF).
8. **Transición sin reinicio**: `botEnabled` false → true → el bot procesa nuevas entradas sin reiniciar el EA.
9. **Trades manuales intactos**: trades del usuario con Magic ≠ 871234 nunca se tocan.
10. **Fail-open universal**: cualquier fallo de red mantiene el último estado conocido (defaults: emergencia=false, botEnabled=true).
11. **Default permisivo**: si el JSON no incluye el campo `botEnabled`, se asume `true` (no quebrar el bot por cambios de shape).
12. **Campo `killSwitch` faltante**: si el JSON no lo trae, NO se actualiza nada (fail-open; el campo es crítico).

## Caso completo de prueba

| Tiempo | Acción                                       | Resultado esperado                              |
|--------|----------------------------------------------|-------------------------------------------------|
| T=0s   | Bot operando con 1 pos + 1 pending           | Normal                                          |
| T=10s  | Usuario activa `botEnabled=false` desde web  | (pendiente próximo poll)                        |
| T=30s  | Poll: detecta `botEnabled=false`             | Log "DESHABILITADO". Posición sigue gestionada. |
| T=45s  | Setup HIGH confirmado                        | REJECTED_FILTER (botEnabled=false)              |
| T=60s  | Precio alcanza 1R en la posición abierta     | SL_MOVED a BE+1 (Management activo)             |
| T=90s  | Usuario activa `killSwitch=true`             | (pendiente próximo poll)                        |
| T=120s | Poll: detecta emergencia                     | Cierre forzado: posición + pending              |
| T=150s | Otro poll (emergencia sigue ON)              | Sin acción (`enforcementDone`)                  |
| T=180s | Usuario desactiva ambos                      | (pendiente próximo poll)                        |
| T=210s | Poll: `killSwitch=false`, `botEnabled=true`  | Log "Emergencia desactivada". Bot operando.     |
| T=240s | Nuevo setup HIGH                             | Procesado normal                                |

## Notas técnicas

- **WebRequest timeout 3s** (menor que el de News=5s) para no congelar OnTick mucho tiempo si Vercel está degradado.
- **Polling sin spam**: solo se loggea en transiciones de estado y en errores. Polls exitosos sin cambio son silenciosos.
- **`KillSwitch_EnforceIfActive` solo dispara con `killSwitchActive=true`**. `botEnabled=false` NO ejecuta enforcement — las posiciones abiertas siguen su gestión natural.
- **Defensa en profundidad en Execution**: `Execution_OpenFromSizing` consulta ambas funciones aunque OnTick ya filtre la emergencia. Si alguien llama directo a Execution, ambos checks aplican.
- **Reinicio del EA con flags ON**: en `OnInit` se hace `KillSwitch_Poll` + `EnforceIfActive` sincronizadamente. Si el journal dice emergencia, el bot arranca dormido. Si dice `botEnabled=false`, arranca con bloqueo de aperturas activo pero Management corriendo.
- **Sin retry inmediato**: tras fallo de poll, se espera 30s al siguiente. No reintentamos en intervalos cortos para no spammear el endpoint en caída.

## Edge cases NUEVOS por separar flags

- **Emergencia ON pero `botEnabled=true`**: comportamiento idéntico a emergencia pura. `botEnabled` se ignora por prioridad.
- **Emergencia desactivada mientras `botEnabled=false`**: el bot NO vuelve completamente a operar; sigue bloqueando aperturas hasta que `botEnabled` también pase a true. El log lo explicita.
- **`botEnabled=false` durante una emergencia activa**: irrelevante mientras `killSwitch=true`; cuando éste se apague, `botEnabled=false` toma el relevo bloqueando aperturas.
