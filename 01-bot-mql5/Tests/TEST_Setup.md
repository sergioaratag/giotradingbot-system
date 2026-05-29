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

**Cuando se detecta un sweep** (dentro de una sesión de entrada Londres/NY):

```
[SETUP] SWEEP_DETECTED | EURUSD SHORT | Sweep: LIQ_LONDON_H (H1) | Sesion: LONDRES
```

> Si el sweep ocurre fuera de horario (antes de 02:00 NY, entre 06:45–07:00, después de 12:15, o fin de semana) **no se crea setup**. Con `VerboseLogging=true` se ve `[SETUP v] ... sweep fuera de ventana de entrada, ignorado`.

**Cuando se confirma** (al menos FVG o CHoCH en la dirección, después del sweep, y aún dentro de la ventana de entrada de la sesión):

```
====================================
[SETUP CONFIRMADO] EURUSD SHORT | Calidad: HIGH (score 9/10)
  Sesion: LONDRES
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
  Sesion: NY
  Sweep: LIQ_PDL (M15)
  FVG: NO
  CHoCH: SI
  Bias: BIAS_BULLISH (a favor)
  >>> Confirmacion sin FVG: sin zona de entrada definida (solo CHoCH)
====================================
```

**Cuando expira por horario** (pasó el límite de entrada, o la confirmación llegó en otra sesión):

```
[SETUP] EXPIRED | GBPUSD LONG | Fuera de ventana de entrada de sesion
```

## Ventana de entrada por sesión (regla corregida)

El bot **NO** usa una ventana fija de minutos. Usa los horarios de sesión (hora NY) como límite de entrada. Solo ABRE posiciones en:

| Sesión  | Apertura | Cierre  | Límite de entrada (15 min antes) |
|---------|----------|---------|----------------------------------|
| Londres | 02:00 NY | 07:00   | **06:45 NY**                     |
| NY      | 07:00 NY | 12:30   | **12:15 NY**                     |

- Sweep fuera de estas ventanas → **no se crea setup**.
- Confirmación después del límite de entrada → **EXPIRED** (no opera).
- Confirmación en una sesión distinta a la del sweep → **EXPIRED**.
- Fin de semana (sábado/domingo) → sin entradas. Viernes después de 12:15 NY → sin entradas (mismo límite NY).
- **Importante**: este límite solo afecta ENTRADAS. Las posiciones **ya abiertas no se cierran** al terminar la sesión — su gestión post-horario (BE, parciales, SL/TP) es del Módulo 9.

## Validaciones en TradingView

1. **Encontrar un setup histórico completo** que cumpla la estrategia:
   - Identificar un sweep claro de liquidez en H4/H1/M15, dentro de horario Londres/NY.
   - Verificar que la confirmación (FVG y/o CHoCH en M5/M3/M1) llegó mientras la sesión seguía abierta para entrar (antes del límite).
   - Anotar dirección, niveles, sesión y hora NY.
2. **Comparar con los logs del bot** en ese mismo momento (los logs usan hora del servidor MT5; el bot la convierte a NY internamente vía `GMTToNY`).
3. **Validar el emparejamiento de dirección** (crítico):
   - Sweep BEARISH (barrió un high) → solo debe generar setups **SHORT**, y solo casa con FVG bearish + CHoCH bearish.
   - Sweep BULLISH (barrió un low) → solo setups **LONG**.
   - Un sweep bearish con FVG bullish → NO debe confirmar.
4. **Validar el límite de entrada de sesión** (caso clave):
   - Sweep a las **12:10 NY** (dentro de NY) con confirmación a las **12:20 NY** (pasó el límite 12:15) → debe loggear **EXPIRED** (`Fuera de ventana de entrada de sesion`), NO confirmar.
   - Sweep a las 12:10 NY con confirmación a las 12:14 NY → debe **CONFIRMAR** (aún dentro del límite).
   - Sweep en Londres (ej. 05:00) cuya confirmación recién llega en NY (ej. 08:00) → **EXPIRED** (cambió de sesión).
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
            [ WAITING ] ── pasó límite de entrada / cambió sesión ──▶ [ EXPIRED ]
                  │
       FVG o CHoCH (dirección correcta, post-sweep, sesión aún abierta)
                  │
                  ▼
           [ CONFIRMED ]   (calcula calidad + score + bias + sesión, loggea)
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
- **Sweeps detectados pero nunca CONFIRMED**: normal si no aparece FVG/CHoCH en la dirección antes de que cierre la ventana de entrada de la sesión (deberían expirar). Subir `VerboseLogging` para ver las líneas `[SETUP v]` cuando sí casan.
- **Nunca aparece NINGÚN SWEEP_DETECTED en horario hábil**: revisar la conversión de hora NY (`GMTToNY` en `Liquidity.mqh`). Si el offset NY/DST está mal, las ventanas de sesión se corren y todo cae fuera de horario. El offset DST automático es un TODO V2 en `Liquidity.mqh`.
- **Confirma con dirección equivocada**: revisar el emparejamiento (sweep bearish → FVG/CHoCH bearish).
- **"STRUCT_TF_M1 not declared"**: el enum `ENUM_STRUCT_TIMEFRAME` en `Common.mqh` necesita `STRUCT_TF_M1` y `Structure.mqh` debe mapearlo a `PERIOD_M1` (se agregó en este módulo para CHoCH en M1).

## Próximo módulo

Módulo 7 (Sizing): calcula el tamaño de posición a partir del riesgo (0.5%), el SL (detrás del sweep, máx 25 pips) y `Bias_GetSizeMultiplier`. Sigue sin ejecutar — eso es el Módulo 8 (Execution).
