# TEST - Módulo Sizing (Módulo 7)

## Qué debería verse en logs

Cada vez que un setup se confirme (`[SETUP CONFIRMADO]`), Sizing emite un bloque inmediatamente después:

```
======= SIZING =======
[SIZING] EURUSD SHORT | Entry: 1.08440 | SL: 1.08470 (3.0 pips)
  TP1: 1.08395 (4.5 pips, 50%) | TP2: 1.08350 (9.0 pips, 30%)
  Riesgo: 1.50% base x 1.00 bias x 1.00 kz = 1.50% (a favor bias, KZ)
  Riesgo USD: $150.00 | Lotes: 5.00
  >>> HABRIA OPERADO CON 5.00 LOTES
======================
```

Si algo impide el cálculo (TickValue=0, entry=SL, geometría inválida):

```
[SIZING] RECHAZADO | EURUSD | Razon: TickValue=0, mercado cerrado o simbolo invalido
```

## Validaciones

1. **HIGH setup en killzone a favor de bias**: 1.5% × 1.0 × 1.0 = **1.5%** del balance.
2. **HIGH setup contra bias en sesión sin KZ**: 1.5% × 0.5 × 0.75 = **0.5625%** (encima del piso, no se ajusta).
3. **LOW setup contra bias en KZ**: 0.5% × 0.5 × 1.0 = 0.25% → **0.5%** (piso mínimo).
4. **SL muy grande (80 pips)**: lotes pequeños, sin rechazo. Sin límite duro de SL.
5. **Lotes < VOLUME_MIN del broker**: se ajustan a VOLUME_MIN y el log marca `(ajustado al minimo del broker)`.
6. **NY Lunch (11:00-12:30 NY)**: cuenta como `IN_KILLZONE` → multiplicador 1.0.
7. **Sin FVG (solo CHoCH)**: entry = precio actual (BID/ASK según dirección).

## Casos manuales (balance $10.000)

| Calidad | Bias  | KZ        | SL pips | Riesgo % esperado | Riesgo USD |
|---------|-------|-----------|---------|-------------------|------------|
| HIGH    | favor | sí        | 20      | 1.50%             | $150       |
| HIGH    | contra| sí        | 20      | 0.75%             | $75        |
| MEDIUM  | favor | sesión-no-KZ | 25   | 0.75%             | $75        |
| LOW     | contra| sesión-no-KZ | 30   | 0.50% (piso)      | $50        |
| HIGH    | favor | sí        | 100     | 1.50%             | $150       |

## Killzones (hora NY)

| Ventana        | Minutos    | Status            |
|----------------|------------|-------------------|
| London KZ      | 120-300    | IN_KILLZONE       |
| Londres no-KZ  | 300-420    | IN_SESSION_NO_KZ  |
| NY AM          | 420-600    | IN_KILLZONE       |
| NY pre-Lunch   | 600-660    | IN_SESSION_NO_KZ  |
| NY Lunch       | 660-750    | IN_KILLZONE       |
| Fuera          | resto      | OUTSIDE_SESSION   |

## Notas

- En backtest/cuenta nueva, `AccountInfoDouble(ACCOUNT_BALANCE)` típicamente es $10.000.
- `SYMBOL_TRADE_TICK_VALUE` puede ser 0 fuera de horas de mercado → el setup se marca como RECHAZADO con esa razón (no rompe la cadena).
- Los lotes se redondean **hacia abajo** al `SYMBOL_VOLUME_STEP` antes de aplicar `VOLUME_MIN`.
