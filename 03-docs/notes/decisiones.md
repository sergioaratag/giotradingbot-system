# Decisiones de diseño

Registro vivo de decisiones que afectan el sistema. Cada entrada con fecha, motivo y contexto.

Formato:

```
## YYYY-MM-DD — Título corto
**Decisión:** qué se decidió.
**Motivo:** por qué.
**Impacto:** qué cambia / qué archivos toca.
```

---

## 2026-04-27 — Setup inicial del proyecto
**Decisión:** estructura tri-monorepo (`01-bot-mql5/`, `02-journal-web/`, `03-docs/`) en una sola carpeta versionada con git.
**Motivo:** mantener bot, dashboard y docs sincronizados. Una sola fuente de verdad por feature.
**Impacto:** estructura inicial creada por prompt de bootstrap.
