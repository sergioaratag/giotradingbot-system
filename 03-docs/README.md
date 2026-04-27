# 03-docs — Documentación CheoTrader

Documentación viva del sistema. Si algo se decide, se anota aquí.

## Índice

- **`SPEC_BOT_ICT.md`** — contrato del bot. Fuente de verdad de las reglas (estrategia, riesgo, ejecución). Cualquier cambio en el bot debe estar reflejado aquí.
- **`backtest/`** — resultados del backtest manual de Fase 0.
  - `resultados/` — Excel/CSV exportados, screenshots de setups marcados.
- **`prompts/`** — prompts reutilizables.
  - `prompt_templates/` — plantillas para Claude Code (init, refactor, debug, review).
- **`screenshots/`** — capturas de referencia de setups, anatomías de sweep, FVG, CHoCH.
- **`notes/`** — registro vivo.
  - `decisiones.md` — cada vez que se modifica una regla dura, va con fecha y motivo.

## Cómo navegar

1. Si necesitas entender QUÉ hace el sistema → `SPEC_BOT_ICT.md`.
2. Si necesitas saber POR QUÉ se decidió algo → `notes/decisiones.md`.
3. Si necesitas datos históricos para validar → `backtest/resultados/`.
4. Si vas a abrir Claude Code para una tarea recurrente → `prompts/prompt_templates/`.

## Convenciones

- Fechas en formato `YYYY-MM-DD`.
- Cualquier modificación a una regla del SPEC requiere bumpear versión y entrada en `decisiones.md`.
- Screenshots con nombre `{pair}_{date}_{setup}.png` (ej. `EURUSD_2026-04-15_sweep-asia-low.png`).
