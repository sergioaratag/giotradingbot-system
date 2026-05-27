# TEST - Módulo Setup (cerebro de la estrategia)

## Setup

Asume Liquidity + Sweep + FVG + Structure + Bias ya cargados. Copiar `Setup.mqh` a `MQL5/Include/` junto a los otros, recompilar `GioBot.mq5` en MetaEditor.

`GioBot.mq5` debe loggear al iniciar:

```
GioBot v0.15 inicializado. Modulos: Liquidity + Sweep + FVG + Structure + Bias + Setup.
Modulo Setup cargado. El bot ahora detecta setups completos (sin ejecutar).
Simbolos: EURUSD, GBPUSD | Verbose: OFF
```

Inputs nuevos:
- `VerboseLogging` (default `false`): si `true`, además de los logs de setup imprime un resumen read-only de liquidez + estructura por TF + bias en cada cierre H1, y líneas `[SETUP v]` cuando encuentra FVG/CHoCH de confirmación.

> **Nota de codificación**: los logs usan ASCII (sin acentos) para coincidir con el estilo de los demás módulos y evitar problemas de render en la pestaña *Experts* de MT5. Por eso se ve `SI` (no `SÍ`) y `HABRIA OPERADO AQUI`.

## Qué debería verse en logs

**Cuando se detecta un sweep** (abre la ventana de 45 min):

```
[SETUP] SWEEP_DETECTED | EURUSD SHORT | Sweep: LIQ_LONDON_H (H1) | Ventana abierta 45min
```

**Cuando se confirma** (al menos FVG o CHoCH en la dirección, después del sweep):

```
====================================
[SETUP CONFIRMADO] EURUSD SHORT | Calidad: HIGH (score 9/10)
  Sweep: LIQ_LONDON_H (H1)
  FVG: SI @ 1.08445-1.08478
  CHoCH: SI
  Bias: BIAS_BEARISH (a favor)
  >>> HABRIA OPERADO AQUI: entrada en zona 1.08445 - 1.08478
====================================
```

> `EnumToString` imprime el nombre completo del enum: el tipo de nivel sale como `LIQ_LONDON_H`, `LIQ_PDH`, etc., y el bias como `BIAS_BULLISH` / `BIAS_BEARISH` / `BIAS_NEUTRAL`.

**Cuando se confirma solo por CHoCH** (sin FVG → no hay zona de entrada):

```
====================================
[SETUP CONFIRMADO] GBPUSD LONG | Calidad: MEDIUM (score 6/10)
  Sweep: LIQ_PDL (M15)
  FVG: NO
  CHoCH: SI
  Bias: BIAS_BULLISH (a favor)
  >>> Confirmacion sin FVG: sin zona de entrada definida (solo CHoCH)
====================================
```

**Cuando expira sin confirmación:**

```
[SETUP] EXPIRED | GBPUSD LONG | Sin confirmacion en 45min, descartado
```

## Validaciones en TradingView

1. **Encontrar un setup histórico completo** que cumpla la estrategia:
   - Identificar un sweep claro de liquidez en H4/H1/M15.
   - Verificar que dentro de 45 min apareció FVG y/o CHoCH en M5/M3/M1.
   - Anotar dirección, niveles y hora.
2. **Comparar con los logs del bot** en ese mismo momento (hora del servidor MT5).
3. **Validar el emparejamiento de dirección** (crítico):
   - Sweep BEARISH (barrió un high) → solo debe generar setups **SHORT**, y solo casa con FVG bearish + CHoCH bearish.
   - Sweep BULLISH (barrió un low) → solo setups **LONG**.
   - Un sweep bearish con FVG bullish → NO debe confirmar.
4. **Validar la ventana de 45 min**: un sweep sin confirmación LTF dentro de la ventana debe loggear `EXPIRED`. Es tiempo real (timestamp), no conteo de velas.
5. **Validar "después del sweep"**: un FVG/CHoCH que se formó ANTES del sweep no debe contar. El bot exige `formedAt / candleTime > sweep.detectedAt`.
6. **Validar el sistema de calidad**:
   - Sweep + FVG + CHoCH → `HIGH`.
   - Sweep + solo uno (FVG o CHoCH) → `MEDIUM`.
   - Score 1-10 coherente con la tabla de abajo.
7. **Validar el bias**: setups a favor del bias deben puntuar más alto que en contra (en contra resta 2 puntos).

## Tabla del score de calidad (CalcQualityScore)

| Factor                                   | Puntos |
|------------------------------------------|--------|
| FVG **y** CHoCH (base HIGH)              | +5     |
| FVG **o** CHoCH (base MEDIUM)            | +3     |
| Solo sweep (base LOW)                    | +1     |
| Sweep en H4                              | +3     |
| Sweep en H1                              | +2     |
| Sweep en M15                             | +1     |
| Calidad del sweep ≥ 8                    | +1     |
| Bias alineado y no neutral               | +2     |
| Bias en contra                           | −2     |
| FVG con calidad ≥ 7                      | +1     |

Resultado acotado a `[1, 10]`. Ejemplo HIGH típico: 5 (FVG+CHoCH) + 2 (H1) + 2 (bias a favor) = 9/10.

## Máquina de estados

```
            sweep detectado
                  │
                  ▼
            [ WAITING ] ──── 45 min sin confirmar ───▶ [ EXPIRED ]
                  │
       FVG o CHoCH (dirección correcta, post-sweep)
                  │
                  ▼
           [ CONFIRMED ]   (calcula calidad + score + bias, loggea)
```

- `SETUP_INVALIDATED` está reservado (lo usará el módulo de Execution); el flujo actual solo produce `WAITING → CONFIRMED/EXPIRED`.
- Housekeeping: setups `EXPIRED`/`CONFIRMED` se eliminan del array tras 1 h. Tope de `SETUP_MAX_ACTIVE = 10` setups en `WAITING` simultáneos.

## Métricas a recolectar (para validar la estrategia)

Durante el forward test, contar:
- Cuántos setups HIGH / MEDIUM / LOW se detectan por día.
- Cuántos expiran vs. cuántos se confirman.
- Si los setups detectados coinciden con los que Sergio detectaría a mano.

## Si algo falla

- **"Setup.mqh not found"**: typo en el include o archivo no copiado a `MQL5/Include/`.
- **Nunca aparece SWEEP_DETECTED**: revisar que Liquidity tenga niveles (`VerboseLogging=true` → ver el resumen `===== Liquidity =====`). Sin niveles activos no hay sweeps.
- **Sweeps detectados pero nunca CONFIRMED**: normal si no aparece FVG/CHoCH en la dirección dentro de 45 min (deberían expirar). Subir `VerboseLogging` para ver las líneas `[SETUP v]` cuando sí casan.
- **Confirma con dirección equivocada**: revisar el emparejamiento (sweep bearish → FVG/CHoCH bearish).
- **"STRUCT_TF_M1 not declared"**: el enum `ENUM_STRUCT_TIMEFRAME` en `Common.mqh` necesita `STRUCT_TF_M1` y `Structure.mqh` debe mapearlo a `PERIOD_M1` (se agregó en este módulo para CHoCH en M1).

## Próximo módulo

Módulo 7 (Sizing): calcula el tamaño de posición a partir del riesgo (0.5%), el SL (detrás del sweep, máx 25 pips) y `Bias_GetSizeMultiplier`. Sigue sin ejecutar — eso es el Módulo 8 (Execution).
