# 🌙 CheoTrader ICT System

Sistema personal de trading automatizado en Forex con metodología ICT/SMC, operando EUR/USD y GBP/USD principalmente sobre prop firms (Orion Funded como referencia).

## Sub-proyectos

- **`01-bot-mql5/`** — Expert Advisor en MQL5 para MetaTrader 5. Detecta sweeps, confirma con FVG/CHoCH, ejecuta y gestiona posiciones autónomamente.
- **`02-journal-web/`** — Dashboard web (Next.js + Prisma + PostgreSQL en Neon) que sirve como journal personalizado: trades del bot + manuales, tareas para Claude Code, notas, calendario económico, kill switch.
- **`03-docs/`** — Documentación viva: SPEC del bot, backtests, prompts reutilizables, screenshots y registro de decisiones.

## Quick start

Lee `INDEX.md` (raíz) para el panorama completo. Lee `03-docs/SPEC_BOT_ICT.md` para el contrato del bot.

## Disclaimer

Este es un sistema **personal** de Sergio Arata. **No es producto comercial**, no es asesoría financiera, no se distribuye. Opera en cuentas propias y de prop firms (principalmente Orion Funded). Forex con apalancamiento implica riesgo de pérdida total — el sistema asume que el operador entiende y acepta ese riesgo.

---

**Owner:** Sergio Arata · `gioarata10@gmail.com`
**Versión:** 0.0.1 (setup inicial)
**Licencia:** Personal use only
