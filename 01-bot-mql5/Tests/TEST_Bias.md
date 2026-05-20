# TEST - Módulo Bias HTF

## Setup

Asume Liquidity + Sweep + FVG + Structure ya cargados. Copiar `Bias.mqh` a `MQL5/Include/` junto a los otros, recompilar `GioBot.mq5`.

`GioBot.mq5` ya debe loggear `Módulos: Liquidity + Sweep + FVG + Structure + Bias.` al iniciar.

## Qué debería verse en logs

Una línea de bias por símbolo al cierre de cada vela H1, después de la línea `[STRUCT]`:

```
[BIAS] EURUSD | BULLISH | Confidence: HIGH | H4: STRUCT_BULLISH | D1: STRUCT_BULLISH
[BIAS] GBPUSD | NEUTRAL | Confidence: CONFLICT | H4: STRUCT_BULLISH | D1: STRUCT_BEARISH
[BIAS] EURUSD | BEARISH | Confidence: MEDIUM | H4: STRUCT_NEUTRAL | D1: STRUCT_BEARISH
[BIAS] EURUSD | NEUTRAL | Confidence: LOW | H4: STRUCT_NEUTRAL | D1: STRUCT_NEUTRAL
```

Valores válidos:
- `bias`: `BULLISH`, `BEARISH`, `NEUTRAL`
- `confidence`: `HIGH`, `MEDIUM`, `LOW`, `CONFLICT`

## Validaciones en TradingView

1. **Mirar EUR/USD en D1**: identificar a ojo si la estructura es alcista (HH/HL), bajista (LH/LL) o neutral.
2. **Mirar EUR/USD en H4**: misma pregunta.
3. **Aplicar la tabla manualmente** y comparar con el log del bot:
   - D1 alcista + H4 alcista → bot debe decir `BULLISH | HIGH`
   - Si difieren → bot debe decir `NEUTRAL | CONFLICT`
4. **Validar el multiplicador** (`Bias_GetSizeMultiplier`):
   - Bias `BULLISH` + trade `DIR_BULLISH` → 1.0
   - Bias `BULLISH` + trade `DIR_BEARISH` → 0.5
   - Bias `NEUTRAL` (cualquier confianza) → 1.0
5. **Coherencia con Structure**: las strings `STRUCT_*` que loggea bias deben coincidir con la línea `[STRUCT]` de la misma vela H1 para H4/D1. (Nota: `[STRUCT]` solo loggea H1/M15/M5; H4 y D1 se consultan en demanda dentro del bias).

## Tabla de combinación

| H4      | D1      | Bias    | Conf     |
|---------|---------|---------|----------|
| BULL    | BULL    | BULL    | HIGH     |
| BEAR    | BEAR    | BEAR    | HIGH     |
| BULL    | NEUTRAL | BULL    | MEDIUM   |
| BEAR    | NEUTRAL | BEAR    | MEDIUM   |
| NEUTRAL | BULL    | BULL    | MEDIUM   |
| NEUTRAL | BEAR    | BEAR    | MEDIUM   |
| BULL    | BEAR    | NEUTRAL | CONFLICT |
| BEAR    | BULL    | NEUTRAL | CONFLICT |
| NEUTRAL | NEUTRAL | NEUTRAL | LOW      |

## Parámetros configurables

Bias.mqh no tiene parámetros propios. Hereda del módulo Structure:
- `SWING_LOOKBACK_BARS` (default 50) — relevante para D1: 50 días de historia es razonable.
- `SWING_FRACTAL_PERIOD` (default 2) — fractal de 5 barras.
- `SWING_MIN_BARS_BETWEEN` (default 3) — distancia mínima entre swings del mismo tipo.

Si en D1 hay pocas velas (símbolos nuevos o instalación reciente), la estructura puede quedar `NEUTRAL` por falta de historia.

## Si algo falla

- "Bias.mqh not found": typo en includes.
- Bias siempre `NEUTRAL | LOW`: probablemente `Structure_GetCurrent` retorna `NEUTRAL` en ambos TFs por poca historia. Verificar manualmente en MT5 que D1 y H4 tienen suficientes barras (`Symbols → bars in chart`).
- Bias contradice lo que se ve en TradingView: revisar la lógica fractal con `SWING_FRACTAL_PERIOD`. Subir a 3 puede dar swings más significativos.
- "STRUCT_TF_D1 not declared": el enum en `Common.mqh` necesita el valor `STRUCT_TF_D1` y el switch en `Structure.mqh` debe mapearlo a `PERIOD_D1`.
- Multiplicador no responde a `DIR_NEUTRAL`: por diseño, el caller solo pasa `DIR_BULLISH` o `DIR_BEARISH` (es trade direction, no señal). Si pasa `DIR_NEUTRAL`, el resultado será 0.5 (no debería ocurrir).

## Próximo módulo

Módulo 6 (Setup): integra TODO. Combina Liquidity sweep + FVG/IFVG mitigation + CHoCH confirmation, y aplica `Bias_GetSizeMultiplier` para el sizing final.
