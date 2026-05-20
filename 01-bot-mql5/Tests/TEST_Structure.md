# TEST - Módulo Structure (CHoCH / BOS)

## Setup

Asume Liquidity + Sweep + FVG ya cargados. Copiar `Structure.mqh` a `MQL5/Include/` junto a los otros, recompilar `GioBot.mq5`.

`GioBot.mq5` ya debe loggear `Módulos: Liquidity + Sweep + FVG + Structure.` al iniciar.

## Qué debería verse en logs

### Estructura actual (cada update H1)

Una línea de resumen por símbolo al cierre de cada vela H1:

```
[STRUCT] EURUSD | H1: STRUCT_BULLISH | M15: STRUCT_BULLISH | M5: STRUCT_NEUTRAL
[STRUCT] GBPUSD | H1: STRUCT_BEARISH | M15: STRUCT_NEUTRAL | M5: STRUCT_BEARISH
```

Valores válidos: `STRUCT_BULLISH`, `STRUCT_BEARISH`, `STRUCT_NEUTRAL`.

### CHoCH detectado (cambio de carácter)

```
[CHoCH BEAR-M15] EURUSD | Broken: 1.08120 | Close: 1.08092 | Q: 7/10
[CHoCH BULL-M5]  GBPUSD | Broken: 1.25340 | Close: 1.25378 | Q: 6/10
```

- `CHoCH BEAR` aparece cuando la estructura previa era BULLISH y el cierre rompió el último HL.
- `CHoCH BULL` aparece cuando la estructura previa era BEARISH y el cierre rompió el último LH.

### BOS detectado (continuación de tendencia)

```
[BOS BULL-H1] EURUSD | Broken: 1.08540 | Close: 1.08561 | Q: 5/10
[BOS BEAR-M5] GBPUSD | Broken: 1.25210 | Close: 1.25188 | Q: 4/10
```

- `BOS BULL`: estructura BULLISH + cierre rompe el último HH.
- `BOS BEAR`: estructura BEARISH + cierre rompe el último LL.

## Validaciones en TradingView

1. **Identificar swings visualmente** en EUR/USD H1 (últimos 2 días):
   - Marcar HH/HL/LH/LL a ojo en cada pivot
   - Comparar contra la estructura reportada en `[STRUCT]`
   - Los swings se confirman con 5 velas (2 antes + pivot + 2 después)

2. **Verificar un CHoCH**: encontrar un cambio de tendencia claro en M15
   - La vela del CHoCH debe CERRAR (no solo tocar) el último HL/LH
   - Comparar la hora de `candleTime` con la vela de TradingView

3. **Verificar BOS**: encontrar una ruptura de HH en tendencia alcista
   - Debe loggear `BOS BULL`, NO `CHoCH`
   - Es la regla más confundida: ruptura A FAVOR = BOS, ruptura CONTRA = CHoCH

4. **Quality score**: revisar que los CHoCH con velas grandes (>ATR) y body fuerte (>70%) tengan Q ≥ 7.

5. **Dedup**: la misma ruptura no debe loggearse dos veces aunque pasen varios ticks dentro de la misma vela.

## Parámetros configurables (Structure.mqh)

- `SWING_LOOKBACK_BARS` (default 50) — cuántas velas atrás escanear
- `SWING_MIN_BARS_BETWEEN` (default 3) — distancia mínima entre swings del mismo tipo (filtra ruido)
- `SWING_FRACTAL_PERIOD` (default 2) — velas a cada lado del pivot (2 → fractal de 5 velas)

Subir `SWING_FRACTAL_PERIOD` a 3 o 4 detecta menos swings pero más significativos.

## Diferencia crucial CHoCH vs BOS

| Estructura previa | Ruptura del último… | Evento     | Significado            |
| ----------------- | ------------------- | ---------- | ---------------------- |
| BULLISH (HH/HL)   | HL                  | CHoCH BEAR | Cambia a bajista       |
| BULLISH (HH/HL)   | HH                  | BOS  BULL  | Continúa alcista       |
| BEARISH (LH/LL)   | LH                  | CHoCH BULL | Cambia a alcista       |
| BEARISH (LH/LL)   | LL                  | BOS  BEAR  | Continúa bajista       |

## Si algo falla

- "Structure.mqh not found": typo en include path
- `[STRUCT_NEUTRAL]` siempre: probablemente el lookback es muy chico o el TF tiene poca historia. Subir `SWING_LOOKBACK_BARS`.
- CHoCH no detectado pero visualmente claro: el cierre puede estar exactamente al nivel; revisar con la línea exacta del último HL/LH. También puede ser que el swing low previo todavía no esté confirmado (necesita 2 velas a la derecha).
- Demasiados CHoCH/BOS espurios en M5: subir `SWING_MIN_BARS_BETWEEN` a 5 o más.
- Mismo evento aparece como NEW varias veces: bug en `StructEventAlreadyExists` (debería matchear por symbol+TF+eventType+candleTime).
- Estructura cambia entre BULLISH/BEARISH cada barra sin razón: probablemente `SWING_FRACTAL_PERIOD` muy bajo y captura ruido. Subir a 3.
