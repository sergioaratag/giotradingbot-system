# 🌙 CheoTrader ICT System

Tu sistema personal de trading automatizado en Forex EUR/USD · GBP/USD · ICT/SMC Methodology · MT5 + Web Journal

## 🎯 Estado actual del proyecto

**Fase actual:** Fase 0 — Setup inicial
**Última actualización:** 2026-04-27
**Próximo hito:** Backtest manual de 30 setups históricos

### Health check

| Componente | Estado | Notas |
|---|---|---|
| Estructura del repo | 🔧 En setup | Creado por prompt inicial |
| Journal web (local) | ⏳ Pendiente | Después del setup base |
| Journal web (deploy) | ⏳ Pendiente | Vercel pendiente |
| Base de datos (Neon) | ⏳ Pendiente | Crear proyecto manual |
| Bot MQL5 | ⏳ Pendiente | Tras backtest |
| Backtest manual | ⏳ Pendiente | Plantilla por crear |
| Demo Pepperstone | ⏳ Pendiente | Crear cuenta |

Leyenda: ✅ OK · 🔧 En progreso · ⏳ Pendiente · ⚠️ Bloqueado

---

## 📂 Estructura del proyecto

```
CheoTrader-ICT-System/
├── 01-bot-mql5/        ← Expert Advisor en MQL5
├── 02-journal-web/     ← Dashboard web personalizado
├── 03-docs/            ← Documentación y recursos
├── INDEX.md            ← (estás aquí)
└── README.md
```

### 01-bot-mql5
Expert Advisor que opera en MetaTrader 5. Detecta sweeps de liquidez, confirma con FVG/IFVG y CHoCH, ejecuta entradas y gestiona posiciones autónomamente. Reporta cada trade al journal vía HTTP.

### 02-journal-web
Aplicación Next.js que funciona como tu "Notion personalizado" de trading:
- Dashboard con métricas en tiempo real
- Journal de trades (bot + manuales)
- Lista de tareas para Claude Code
- Notas y journaling
- Calendario económico (ForexFactory)
- Kill switch del bot

### 03-docs
Documentación viva del proyecto:
- `SPEC_BOT_ICT.md` — el contrato del bot
- `backtest/` — resultados del backtest manual
- `prompts/` — prompts reutilizables para Claude Code
- `screenshots/` — referencias visuales de setups
- `notes/` — registro de decisiones

---

## 🚀 Quick Start

### Si estás iniciando por primera vez
1. Lee `03-docs/SPEC_BOT_ICT.md` completo (el contrato del bot)
2. Sigue el roadmap en la sección 12 del spec
3. Empieza por Fase 0: backtest manual

### Si vienes a trabajar día a día
1. Abre el journal web: `cd 02-journal-web && npm run dev`
2. Revisa la lista de tareas pendientes en `/tasks`
3. Trabaja con Claude Code desde la terminal en la raíz del proyecto

### Si vienes a revisar trades del bot
1. Abre el journal en producción (URL de Vercel)
2. Dashboard muestra resumen del día
3. Sección Trades muestra detalle completo

---

## 🛠 Stack técnico

**Bot (`01-bot-mql5`):**
- MQL5 (Expert Advisor)
- MetaTrader 5
- VPS Windows (en producción)

**Journal Web (`02-journal-web`):**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS (paleta Midnight personalizada)
- Prisma + PostgreSQL (Neon)
- NextAuth (email/password)
- Recharts (gráficas)
- Vercel (hosting)

**Integraciones:**
- ForexFactory XML (calendario económico)
- Resend (notificaciones email, opcional)
- Telegram Bot API (alertas, opcional)

---

## 🔑 Variables de entorno necesarias

Ver `02-journal-web/.env.example` para el template completo. Las críticas:

- `DATABASE_URL` — PostgreSQL de Neon
- `NEXTAUTH_SECRET` — generar con `openssl rand -base64 32`
- `BOT_API_KEY` — secret para autenticar requests del EA al journal

---

## 📋 Workflow con Claude Code

### Cómo trabajar día a día

**Para tareas en el journal web:**

```bash
cd ~/Desktop/CheoTrader-ICT-System
claude
```

Y le dices a Claude Code la tarea, o mejor aún:

> "Lee la lista de tareas pendientes en el journal y trabaja la primera de prioridad alta."

**Para tareas en el bot MQL5:** Igual, pero recuerda que MQL5 requiere compilar manualmente en MetaEditor después de cada cambio. Sergio mantiene MetaTrader 5 abierto en paralelo.

### Cómo agregar tareas

Tres formas:
1. Desde el journal web (recomendado): página `/tasks/new`
2. Desde el celular: misma página, mobile-friendly
3. Cuando estés en una conversación con Claude: pídele que la agregue vía API

---

## 🎨 Paleta de colores "CheoTrader Midnight"

| Color | Hex | Uso |
|---|---|---|
| Midnight 950 | `#050918` | Fondo principal |
| Midnight 900 | `#0A1228` | Cards, paneles |
| Midnight 800 | `#141D3D` | Headers, secciones |
| Midnight 700 | `#1F2C54` | Bordes, dividers |
| Midnight 50  | `#E8EAF2` | Texto principal |
| Profit       | `#22C55E` | P&L positivo |
| Loss         | `#EF4444` | P&L negativo |
| Warning      | `#F59E0B` | Alertas, noticias amarillas |
| Info         | `#3B82F6` | Información, links |

**Tipografía:**
- Inter — UI general
- JetBrains Mono — números, precios, código

---

## 📅 Roadmap resumido

- **Fase 0:** Validación pre-código (backtest manual de 30 setups)
- **Fase 1:** Journal web funcional
- **Fase 2:** Bot MQL5 módulo por módulo
- **Fase 3:** Forward test en demo Pepperstone (4 semanas)
- **Fase 4:** Challenge en Orion Funded
- **Fase 5:** Mejoras V2 (después de 200+ trades)

Detalle completo en `03-docs/SPEC_BOT_ICT.md` sección 12.

---

## 📝 Reglas duras del sistema

Estas reglas están en piedra. Si alguna se viola, hay un bug que arreglar:

1. ✅ Pérdida diaria máxima: **1.5%**
2. ✅ Solo opera EUR/USD y GBP/USD
3. ✅ Solo lunes a viernes (viernes hasta las 12:00 NY)
4. ✅ Bloqueo de 30 min antes y después de noticias rojas
5. ✅ R:R mínimo: **1:2**
6. ✅ SL máximo: **25 pips**
7. ✅ Nunca operar overnight (cierre forzado a las 16:00 NY)
8. ✅ Misma estrategia en evaluación y cuenta fondeada (regla Orion)

---

## 🆘 Troubleshooting

### El bot no detecta sweeps
- Verificar que la lista de pools de liquidez se está actualizando
- Verificar que el horario en MT5 es UTC (todos los cálculos asumen UTC)
- Revisar logs en `01-bot-mql5/Files/logs/`

### El journal no recibe trades del bot
- Verificar `BOT_API_KEY` coincide en `.env` y en config del EA
- Verificar que el endpoint `/api/bot/trade` está deployado
- Revisar logs de Vercel
- Probar con `curl` manual

### Conflicto de zona horaria
El sistema usa NY time como referencia para sesiones (matches MT5 default broker time para muchos brokers ECN). Pepperstone y la mayoría de brokers usan GMT+2/+3. Validar offset en config.

---

## 📞 Recursos

- Documento maestro: `03-docs/SPEC_BOT_ICT.md`
- ForexFactory XML: `https://nfs.faireconomy.media/ff_calendar_thisweek.xml`
- Orion Funded rules: `help.orionfunded.com`
- MQL5 docs: `mql5.com/en/docs`
- Pepperstone MT5: `pepperstone.com`

---

## 📊 Metas medibles

Estas son las métricas objetivo para considerar el sistema "validado":

### Pre-challenge (demo)
- Win rate ≥ 50% sobre mínimo 50 trades
- Expectancy ≥ 0.3R
- Max drawdown < 5%
- Profit factor ≥ 1.5

### Challenge fase 1 (Orion)
- Alcanzar profit target sin tocar daily drawdown
- Mínimo 5 días de trading
- Consistencia (ningún día > 30% del profit total)

### Cuenta fondeada
- Sostener ≥ 0.3R expectancy
- Drawdown < 6% mensual
- Mínimo 1 retiro mensual

---

> *"The market is not the enemy — your reactions are."* — Mark Douglas, *Trading in the Zone*

**Owner:** Sergio Arata · `gioarata10@gmail.com`
**Versión del sistema:** 0.0.1 (setup inicial)
**Licencia:** Personal use only
