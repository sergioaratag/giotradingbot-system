# TEST - Módulo Sweep

## Setup adicional a TEST_Liquidity.md
Asume que Liquidity ya está compilado y validado.

## Qué debería verse en logs

Cuando se detecte un sweep:
```
[SWEEP-H1] BULL | EURUSD | Level: LIQ_PDL @ 1.07921 | Wick: 1.07895 | Close: 1.07956 | Pips perf: 2.6 | Quality: 8/10
[SWEEP-M15] BEAR | GBPUSD | Level: LIQ_LONDON_H @ 1.25441 | Wick: 1.25478 | Close: 1.25409 | Pips perf: 3.7 | Quality: 7/10
```

## Validaciones a hacer en TradingView

1. **Identificar visualmente 5-10 sweeps en últimos 7 días en EUR/USD H1**:
   - Marcar el nivel original (que coincide con liquidity detectado por Módulo 1)
   - Verificar que la vela perfora el nivel con mecha
   - Verificar que cierra del lado original
   - Comparar con lo que loggea el bot

2. **Falsos positivos a buscar**:
   - Velas que cierran del lado opuesto (eso es BOS, no sweep)
   - Mechas mínimas (<1 pip) que no son sweep real
   - Perforaciones gigantes (>30 pips) que son breakouts

3. **Validar quality scores**:
   - Sweep H4 de PWH con cierre fuerte → quality 8-10
   - Sweep M15 de ASIA_L con cierre débil → quality 4-6
   - Sweep H1 de EQH → quality 7-9

4. **Validar marcado en Liquidity**:
   - Después de detectar sweep de PDH, ese nivel debe aparecer con isSwept=YES en el próximo log de Liquidity

## Parámetros configurables (Sweep.mqh)

- `SWEEP_MIN_PERFORATION_PIPS` (default 1.0) — bajar para detectar sweeps más sutiles, subir para filtrar ruido
- `SWEEP_MAX_PERFORATION_PIPS` (default 30.0) — corta breaks exagerados
- `SWEEP_MIN_CLOSE_RATIO` (default 0.30) — qué tan fuerte debe ser el cierre del lado original
- `SWEEP_MIN_QUALITY` (default 5) — score mínimo para reportar; subir si hay demasiados falsos positivos

## Si algo falla

- Compilation errors: copiar el mensaje exacto y reportar
- Sweep no detectado pero visible en TradingView: revisar parámetros (sobre todo `SWEEP_MIN_QUALITY` y `SWEEP_MIN_CLOSE_RATIO`)
- Sweep duplicado en logs sucesivos: bug en `Liquidity_MarkSwept` o en el dedup de `AddLevel`
- Quality scores fuera de [1,10]: bug en `CalculateQuality`
