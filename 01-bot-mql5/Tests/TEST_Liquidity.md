# TEST - Módulo Liquidity

## Setup en MetaEditor

1. Copiar Common.mqh y Liquidity.mqh a MQL5/Include/
2. Copiar GioBot.mq5 a MQL5/Experts/
3. Compilar (F7) — debe compilar sin errores ni warnings
4. En MT5, abrir gráfico EUR/USD
5. Arrastrar GioBot al gráfico
6. En el dialog: marcar "Permitir auto trading" (aunque este módulo no trade), confirmar inputs default
7. Ver tab "Experts" para logs

## Qué debería verse

Cada hora (al inicio de cada vela H1), aparece en log:
```
===== Liquidity para EURUSD =====
Total niveles activos: 8-12
LIQ_PDH @ 1.08543 | Strength: 9 | Formed: 2026.05.05 16:00 | Swept: NO
LIQ_PDL @ 1.07921 | Strength: 9 | ...
LIQ_LONDON_H @ 1.08234 | ...
...
=========================
```

## Validaciones a hacer

1. **PDH y PDL coinciden con TradingView**: abrir TradingView EUR/USD D1, verificar que el high/low de la vela de ayer coincide con lo que loggea el bot.

2. **PWH y PWL coinciden con TradingView**: idem pero W1, semana anterior.

3. **Asia/London/NY High/Low**: marcar manualmente esos rangos en TradingView en H1, comparar.

4. **EQH/EQL detectados**: buscar visualmente en el chart si hay 2+ highs/lows iguales en últimas 100 velas, ver si el bot los detecta.

5. **Marcado de swept**: si después de que el bot detecta un PDH, el precio rompe ese PDH, en el siguiente update debería aparecer `Swept: YES`.

## Si algo falla

- Compilation errors: copiar el mensaje exacto y reportar
- Niveles no coinciden con TradingView: anotar la diferencia y reportar
- Logs no aparecen: verificar permisos del EA, "Common.mqh not found" suele ser typo
