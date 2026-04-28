# GIO · Trading Journal

Aplicación Next.js (App Router) — el journal personal de **GIO / GioTradingBot — ICT**: dashboard, registro de trades (bot + manuales), tareas, notas, calendario económico, vault personal y kill switch del bot.

## Stack

- Next.js 16 (App Router) + TypeScript + React 19
- Tailwind CSS v4 (paleta GIO Premium)
- Prisma + PostgreSQL (Neon)
- NextAuth v5 (email/password)
- Recharts, lucide-react, @tanstack/react-query

## Correr en local

```bash
cd 02-journal-web
cp .env.example .env
# editar .env con credenciales
npx prisma generate
npx prisma migrate dev
npm run dev
```

Abrir `http://localhost:3000`.

## Variables de entorno

Ver `.env.example`. Las críticas:

- `DATABASE_URL` — connection string de Neon
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` en dev
- `BOT_API_KEY` — secret compartido con `01-bot-mql5/Files/config.json`

## Deploy

Vercel apuntando al subdirectorio `02-journal-web/`. Cargar variables de entorno y la Neon DB vía Vercel Marketplace.

## Endpoints clave

- `POST /api/bot/trade` — recibe trades del EA
- `POST /api/bot/event` — eventos del EA
- `GET /api/bot/kill-switch` — el EA consulta antes de operar
- `GET /api/news` — sincroniza ForexFactory
- `GET/POST /api/vault` — entradas del vault personal
