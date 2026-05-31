# TEST - Módulo Execution (Módulo 8)

Este es el primer módulo que envía `OrderSend()` real a MT5. Verificar **siempre en demo primero**.

## Qué debería verse en logs

### Trade abierto Market
```
======= EXECUTION OK =======
[EXECUTION] MARKET SHORT | EURUSD | Ticket: 12345 | Lotes: 0.85
  Precio ejecutado: 1.08438
  SL: 1.08470 | TP1: 1.08390
  Comment: GIO-H-SWEEP_TF_H1-Q9 | Magic: 871234
============================
```

### Trade abierto Limit
```
======= EXECUTION OK =======
[EXECUTION] LIMIT LONG | GBPUSD | Ticket: 12346 | Lotes: 0.42
  Precio limit: 1.25340 (valido 45 min)
  SL: 1.25290 | TP1: 1.25415
  Comment: GIO-M-SWEEP_TF_M15-Q6 | Magic: 871234
============================
```

### Rechazo por daily loss
```
[EXECUTION] REJECTED_DAILY_LOSS | EURUSD SHORT | Razon: Daily loss -1.5% alcanzado. Bloqueado hasta 07:00 NY del dia siguiente.
```

### Rechazo por cap de riesgo
```
[EXECUTION] REJECTED_RISK | GBPUSD LONG | Razon: Cap riesgo: actual 1.20%, nuevo necesita 1.50%, queda 0.30% (minimo 0.50%)
```

### Lotaje reducido (cap de riesgo aplicado al nuevo trade)
```
======= EXECUTION OK =======
[EXECUTION] MARKET LONG | GBPUSD | Ticket: 12347 | Lotes: 0.28
  ...
  Comment: GIO-H-SWEEP_TF_H1-Q9-RC | Magic: 871234
============================
```
El sufijo `-RC` ("risk-capped") señala que el lotaje fue escalado para respetar el cap agregado.

### Limit cancelado por expiración
```
[EXECUTION] Limit cancelado ticket=12346 | Razon: 45 min vencidos
```

### Limit cancelado por fin de ventana de sesión
```
[EXECUTION] Limit cancelado ticket=12348 | Razon: fuera de ventana de entrada
```

## Validaciones

1. **Market cuando precio dentro del FVG**: precio actual ∈ [fvg.bottom, fvg.top] → abre `MARKET`.
2. **Market cuando precio a ≤5 pips del borde**: precio ∈ [fvg.bottom-5, fvg.top+5] → abre `MARKET`.
3. **Limit cuando precio a >5 pips**: precio fuera del rango ampliado → abre `LIMIT` en centro del FVG.
4. **Sin FVG (solo CHoCH)**: siempre abre `MARKET`.
5. **Cap de riesgo**: con 2 posiciones HIGH a 1.5% sumadas, un 3er setup → `REJECTED_RISK`.
6. **Reducción automática**: 1 posición a 1.0%, nuevo HIGH pide 1.5% → abre con lotaje reducido (~33% del original) sumando 0.5% más. Comment incluye `-RC`.
7. **Espacio <0.5%**: 1 posición a 1.2%, nuevo HIGH pide 1.5% → `REJECTED_RISK` (queda 0.3%, abajo del piso 0.5%).
8. **Daily loss**: simular pérdidas hasta -1.5% del balance del día → próximos setups `REJECTED_DAILY_LOSS`. Posiciones abiertas siguen.
9. **Limit cancela a los 45 min**: dejar un Limit, esperar 45 min (verificar `Execution_CancelExpiredLimits` corre cada minuto desde OnTick) → cancelado.
10. **Limit cancela al pasar 06:45 Londres / 12:15 NY**: aunque tenga <45 min, se cancela al cruzar el límite de entrada de la sesión.
11. **Magic number**: todas las órdenes deben mostrar `Magic: 871234`. Trades manuales del usuario no son tocados ni contados en el cap.
12. **Sizing inválido (TickValue=0 fuera de mercado)**: `INVALID_SIZING` con la razón propagada de Sizing.
13. **Robustez al reiniciar**: cerrar y reabrir el EA con posiciones del bot vivas → `Execution_GetCurrentRiskExposure` las cuenta correctamente (vive en MT5, no en memoria del EA).

## Casos manuales (balance $10.000)

| Estado previo (suma)  | Setup nuevo  | Resultado esperado                       |
|-----------------------|--------------|------------------------------------------|
| 0%                    | HIGH 1.5%    | Abre con lotaje completo                 |
| 1.0%                  | HIGH 1.5%    | Abre con ~33% del lotaje (suma 1.5%, `-RC`) |
| 1.2%                  | HIGH 1.5%    | REJECTED_RISK (queda 0.3% < piso 0.5%)   |
| 1.5%                  | LOW 0.5%     | REJECTED_RISK (queda 0%)                 |
| 0%, daily PnL -150 USD| HIGH 1.5%    | REJECTED_DAILY_LOSS                      |

## Reset del daily loss

El día empieza a las **07:00 NY**. `GetNYDayStart()`:
- Si la hora actual es ≥ 07:00 NY → retorna 07:00 NY de hoy.
- Si la hora actual es < 07:00 NY → retorna 07:00 NY de ayer.

Esto significa que los deals cerrados entre 07:00 NY y 06:59 NY del día siguiente cuentan como "del mismo día de trading".

## Notas técnicas

- `EXECUTION_SLIPPAGE_POINTS = 20` (2 pips) en Market.
- `CTrade.SetTypeFillingBySymbol()` aplica el filling mode soportado por el broker (FOK / IOC / Return) automáticamente.
- Si `OrderSend` falla, el log muestra `code=...` y descripción retornada por MT5; no se reintenta automáticamente (las razones típicas — no-funds, market-closed, requote — no se resuelven con retry naïve).
- Pending orders y posiciones abiertas previas al reinicio del EA **siguen siendo gestionadas** porque el filtro es por `BOT_MAGIC_NUMBER` y vive en MT5.
- Filtros del Módulo 10 (spread, ATR, viernes tarde) están **dejados como TODO** en `Execution_OpenFromSizing` para integración futura.
