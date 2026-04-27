# SPEC_BOT_ICT — Contrato del bot

> Este documento es la **fuente de verdad** de la estrategia. Cualquier cambio en el código debe estar reflejado aquí. Cualquier cambio aquí requiere entrada en `notes/decisiones.md`.

**Versión:** 0.0.1 (esqueleto inicial)
**Owner:** Sergio Arata
**Última actualización:** 2026-04-27

---

## 1. Objetivo

Sistema automatizado en MT5 que opera Forex (EUR/USD, GBP/USD) usando metodología ICT/SMC, optimizado para superar evaluaciones de prop firms (Orion Funded como referencia) y sostener una cuenta fondeada con expectancy ≥ 0.3R.

## 2. Alcance

- **In:** sweeps de liquidez en killzones, confirmación FVG/IFVG + CHoCH, ejecución de market orders, gestión TP1/TP2/BE, daily loss cap, news filter.
- **Out (V1):** múltiples pares más allá de EUR/USD y GBP/USD, scalping fuera de killzones, news trading, hedging, martingala.

## 3. Estrategia (resumen)

1. **Bias HTF** (D1 → H4 → H1): bullish, bearish o neutral. Si neutral, no opera.
2. **Liquidity pools** vivos: Asia high/low, PDH/PDL, equal highs/lows, session highs/lows.
3. **Sweep**: barrido (stop-run) de un pool con reversión inmediata.
4. **Confirmación LTF** (M1/M5): FVG o IFVG + CHoCH en dirección del bias.
5. **Entrada**: market order al precio, SL detrás del sweep, TP1 = 2R, TP2 = 4R.
6. **Manage**: a TP1 → BE; a TP2 → cerrar.
7. **Cierre forzado**: 16:00 NY o cualquier daily cap golpeado.

## 4. Reglas duras (no negociables)

| # | Regla | Razón |
|---|---|---|
| 1 | Daily loss cap **1.5%** | Margen vs. límite Orion (5%) |
| 2 | Solo **EUR/USD y GBP/USD** | Liquidez y comportamiento ICT cleanest |
| 3 | Lunes a viernes (cierre **viernes 12:00 NY**) | Evitar gap fin de semana |
| 4 | **30 min antes/después** de noticias rojas | Evitar slippage extremo |
| 5 | R:R mínimo **1:2** | Expectancy positivo aún a 35% WR |
| 6 | SL máximo **25 pips** | Filtrar setups de mala calidad |
| 7 | **No overnight** (cierre 16:00 NY) | Evitar gaps y rollover negativo |
| 8 | **Misma estrategia eval ↔ fondeada** | Regla Orion |

## 5. Sesiones / Killzones (NY time)

- **London**: 02:00–05:00
- **NY AM**: 08:30–11:00
- **NY PM**: 13:30–15:00
- **Asia range** (referencia): 19:00–00:00 (no opera, solo registra)

## 6. Bias HTF

- Calculado al abrir el día (00:00 NY).
- Recalculado cada cierre H1.
- `BULLISH` si HH/HL en H4 y H1 alineado.
- `BEARISH` si LL/LH en H4 y H1 alineado.
- `NEUTRAL` en cualquier desalineación → no opera.

## 7. Detección Sweep + Confirmación

- **Sweep válido**: vela cierra de vuelta dentro del rango previo, con wick ≥ 2 pips fuera del pool.
- **Edad máxima** del sweep para considerarlo activo: 30 barras M1.
- **FVG** mínimo: 1.5 pips, requiere displacement.
- **CHoCH**: break de la última estructura LTF en dirección del bias.

## 8. Riesgo y money management

- Riesgo por trade: **0.5%**.
- Máx. trades concurrentes: **1**.
- Move to BE tras TP1 hit.
- Si daily cap golpeado: cerrar todo y bloquear hasta el día siguiente.

## 9. Parámetros configurables

Todos en `01-bot-mql5/Files/config.json`. Editables sin recompilar. Cualquier cambio en parámetros marcados como "regla dura" requiere entrada en `notes/decisiones.md`.

## 10. Comunicación con journal

- Cada trade: `POST /api/bot/trade` con payload completo (entry, SL, TP, contexto ICT, screenshots opcionales).
- Cada evento relevante: `POST /api/bot/event` (entry, TP hit, SL hit, daily cap, error).
- Cada ciclo: `GET /api/bot/kill-switch` para validar si seguir operando.
- Auth: header `X-Bot-Api-Key`.

## 11. Logging

- Niveles: `DEBUG`, `INFO`, `WARN`, `ERROR`.
- Default en producción: `INFO`.
- Archivos en `Files/logs/` con rotación diaria.

## 12. Roadmap

- **Fase 0** — Backtest manual de 30 setups históricos. Validar WR ≥ 50% y expectancy ≥ 0.3R **antes de escribir código del bot**.
- **Fase 1** — Journal web funcional (auth, trades, tareas, notas).
- **Fase 2** — Bot MQL5 módulo a módulo. Orden: Logger → SessionManager → LiquidityManager → SweepDetector → FVGDetector → ChochDetector → BiasCalculator → RiskManager → TradeManager → NewsFilter → HttpClient → ICT_Bot.
- **Fase 3** — Forward test demo Pepperstone (4 semanas mínimo).
- **Fase 4** — Challenge Orion Funded.
- **Fase 5** — Mejoras V2 (después de 200+ trades reales).

---

> "The market is not the enemy — your reactions are." — Mark Douglas
