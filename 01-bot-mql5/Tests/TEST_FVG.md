# TEST - Módulo FVG / IFVG

## Setup
Asume Liquidity y Sweep ya cargados. Copiar `FVG.mqh` a `MQL5/Include/` junto a los otros, recompilar `GioBot.mq5`.

## Qué debería verse en logs

FVG detectado (NEW):
```
[FVG-M5] NEW | BULL | EURUSD | State: FRESH | Top: 1.08234 | Bot: 1.08210 | Size: 2.4 pips | Q: 7/10
[FVG-H1] NEW | BEAR | GBPUSD | State: FRESH | Top: 1.25670 | Bot: 1.25634 | Size: 3.6 pips | Q: 8/10
```

FVG transitionando a MITIG (precio entró al gap pero no cerró del lado opuesto):
```
[FVG-M15] UPDATE | BULL | EURUSD | State: MITIG | Top: 1.08234 | Bot: 1.08210 | Size: 2.4 pips | Q: 7/10
```

FVG invalidado (cierre del lado opuesto) → IFVG:
```
[FVG-M5] UPDATE | BULL | EURUSD | State: INVAL | Top: 1.08234 | Bot: 1.08210 | Size: 2.4 pips | Q: 7/10 | IFVG
```

FVG expirado por edad (>50 barras del TF):
```
[FVG-M5] EXPIRED | BEAR | GBPUSD | State: INVAL | ... (sin etiqueta IFVG)
```

## Validaciones en TradingView

1. **Identificar visualmente 5 FVGs** en EUR/USD M5 últimos 2 días:
   - Marcar Top y Bottom del gap (proyectando high de vela 1 y low de vela 3 para bullish)
   - Anotar tipo (bullish/bearish) y tamaño aproximado en pips
   - Comparar contra logs `[FVG-M5] NEW`

2. **Verificar tamaño mínimo**: FVGs < 1.5 pips NO deben aparecer en logs.

3. **Verificar displacement**: si la vela del medio es casi una doji (body chico) NO debería detectarse aunque exista el gap geométrico.

4. **Probar mitigación**: encontrar un FVG donde el precio volvió a entrar al gap pero no lo perforó completamente → debe quedar como `State: MITIG`.

5. **Probar invalidación → IFVG**: encontrar un FVG bullish donde el precio cerró debajo del bottom → debe aparecer `UPDATE` con `State: INVAL | IFVG`.

6. **Probar expiración**: dejar correr el bot >50 barras del TF, los FVGs viejos deben loggear `EXPIRED` (sin IFVG).

## Parámetros configurables (FVG.mqh)

- `FVG_MIN_SIZE_PIPS` (default 1.5) — subir para filtrar gaps chicos
- `FVG_MAX_AGE_BARS` (default 50) — cuánto persiste un FVG no tocado
- `FVG_MIN_DISPLACEMENT` (default 0.5) — factor del body de vela 2 vs promedio. Subir (ej. 1.5) si hay demasiados falsos positivos por velas medias chicas
- `FVG_SCAN_BARS` (default 20) — cuántas velas atrás escanea cada call

## Si algo falla

- "Common.mqh not found": typo en includes
- FVG no detectado pero visible: probablemente el displacement filter está muy estricto, o el size < FVG_MIN_SIZE_PIPS
- Mismo FVG aparece N veces como NEW: bug en `FVGAlreadyExists` (debería matchear por symbol+TF+type+formedAt)
- IFVGs no se marcan: revisar que el `lastClose` realmente cruzó el lado opuesto del gap
