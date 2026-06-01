# TEST - Módulo Filters (Módulo 10)

Filtros pre-entrada + cierre forzado de viernes.

## Qué debería verse en logs

### Rechazo por spread
```
[FILTERS] REJECTED | EURUSD | Spread 2.30 pips > maximo 1.50 pips | Spread: 2.30 pips | ATR(14) H1: 12.40 pips
[EXECUTION] REJECTED_FILTER | EURUSD SHORT | Razon: Spread 2.30 pips > maximo 1.50 pips
```

### Rechazo por ATR (mercado muerto)
```
[FILTERS] REJECTED | EURUSD | ATR(14) H1 = 5.80 pips < minimo 8.00 pips (mercado muerto) | Spread: 0.50 pips | ATR(14) H1: 5.80 pips
[EXECUTION] REJECTED_FILTER | EURUSD LONG | Razon: ATR(14) H1 = 5.80 pips < minimo 8.00 pips (mercado muerto)
```

### Rechazo por viernes tarde
```
[FILTERS] REJECTED | GBPUSD | Viernes >= 12:00 NY - no se abren nuevas posiciones | Spread: 0.80 pips | ATR(14) H1: 14.20 pips
[EXECUTION] REJECTED_FILTER | GBPUSD SHORT | Razon: Viernes >= 12:00 NY - no se abren nuevas posiciones
```

### Cierre forzado viernes 16:00 NY
```
[FILTERS] Cierre forzado viernes 16:00 NY | Ticket: 12345 | EURUSD
[FILTERS] Cierre forzado viernes 16:00 NY | Ticket: 12346 | GBPUSD
[FILTERS] Pending cancelado viernes 16:00 NY | Ticket: 12347
```

## Validaciones

1. **Spread filter EURUSD**: con spread broker > 1.5 pips → `REJECTED_FILTER`.
2. **Spread filter GBPUSD**: con spread broker > 2.0 pips → `REJECTED_FILTER`.
3. **Sufijos del broker**: el matcher usa `StringFind`, así que `EURUSD.s`, `EURUSDecn`, `EURUSDm` aplican los mismos thresholds que `EURUSD`.
4. **ATR EURUSD**: con ATR(14) H1 < 8 pips → `REJECTED_FILTER` (mercado muerto / festivo / Asian-only).
5. **ATR GBPUSD**: con ATR(14) H1 < 10 pips → `REJECTED_FILTER`.
6. **Viernes 12:00 NY bloquea aperturas**: Setup confirmado a las 12:01 NY → `REJECTED_FILTER` por viernes.
7. **Viernes 16:00 NY cierra todo**: posiciones del bot se cierran a Market; pendings se cancelan. El cleanup corre cada minuto desde OnTick.
8. **Magic filter**: trades del usuario (no bot) NO se cierran ni cancelan — sólo aquellos con `Magic == 871234`.
9. **Sábado/Domingo**: cubiertos por Setup_Process (no entra en ventana de entrada), Filters no necesita un check duplicado.

## Tabla horaria viernes (hora NY)

| Hora NY  | Comportamiento                                                  |
|----------|-----------------------------------------------------------------|
| 00:00-11:59 | Apertura normal según sesión (Londres KZ, NY AM hasta 12:15)  |
| 12:00+   | `Filters_IsFridayNoNewEntries()` → bloquea nuevas posiciones     |
| 16:00+   | `Filters_IsFridayClosingTime()` → cierre forzado + cancel pendings |

## Casos manuales

| Símbolo  | Spread broker | ATR(14) H1 | Día/Hora NY  | Resultado            |
|----------|---------------|-----------|--------------|----------------------|
| EURUSD   | 1.0 pip       | 12 pips   | Mar 09:00 NY | OK                   |
| EURUSD   | 2.0 pips      | 12 pips   | Mar 09:00 NY | REJECTED (spread)    |
| EURUSD   | 1.0 pip       | 6 pips    | Mar 09:00 NY | REJECTED (ATR)       |
| GBPUSD   | 1.8 pips      | 14 pips   | Mar 09:00 NY | OK                   |
| GBPUSD   | 2.5 pips      | 14 pips   | Mar 09:00 NY | REJECTED (spread)    |
| EURUSD   | 1.0 pip       | 12 pips   | Vie 11:30 NY | OK                   |
| EURUSD   | 1.0 pip       | 12 pips   | Vie 12:00 NY | REJECTED (viernes)   |
| EURUSD   | 1.0 pip       | 12 pips   | Vie 15:59 NY | REJECTED (viernes) — y posiciones siguen abiertas |
| EURUSD   | 1.0 pip       | 12 pips   | Vie 16:00 NY | REJECTED (viernes) + cierre forzado activo |

## Notas técnicas

- ATR calculado a mano (loop sobre True Range de las últimas 14 velas H1), sin handles de indicador — consistente con Structure.mqh.
- Spread se lee de `SymbolInfoInteger(symbol, SYMBOL_SPREAD)` en puntos; se convierte a pips dividiendo por `pip / point`.
- El filtro corre **antes** del daily-loss check en `Execution_OpenFromSizing`. Si un setup cae aquí, no consume cap de riesgo ni daily-PnL.
- Cierre forzado viernes 16:00 NY es **idempotente**: si el array de posiciones del bot está vacío no hace nada.

## TODO V2

- Pausa por N pérdidas consecutivas: tracker de últimos cierres en `s_recentClosures[]`, contar SL hits seguidos, bloquear si llega a N.
- Filtros por par cruzado (XAUUSD, USDJPY) con sus propios thresholds.
