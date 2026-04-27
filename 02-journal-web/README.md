# 02-journal-web — CheoTrader Journal

Aplicación Next.js (App Router) que funciona como journal personalizado: dashboard, registro de trades (bot + manuales), tareas para Claude Code, notas, calendario económico y kill switch del bot.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (paleta Midnight)
- Prisma + PostgreSQL (Neon)
- NextAuth v5 (email/password)
- Recharts, lucide-react, @tanstack/react-query

## Correr en local

```bash
cd 02-journal-web
cp .env.example .env
# editar .env con tus credenciales
npx prisma generate
npx prisma migrate dev
npm run dev
```

Abrir `http://localhost:3000`.

## Variables de entorno requeridas

Ver `.env.example`. Las críticas:

- `DATABASE_URL` — connection string de Neon
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` en dev
- `BOT_API_KEY` — secret compartido con `01-bot-mql5/Files/config.json`

Opcionales:

- `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Deploy a Vercel

1. Crear proyecto en Vercel apuntando a este subdirectorio (`02-journal-web/`).
2. Configurar el "Root Directory" a `02-journal-web`.
3. Cargar todas las variables de entorno (la Neon DB recomendada vía Vercel Marketplace).
4. Deploy. La URL de prod va en `NEXTAUTH_URL` y como `journal_api.base_url` del bot.

## Endpoints clave (planeados)

- `POST /api/bot/trade` — recibe trades del EA
- `POST /api/bot/event` — recibe eventos (entry, TP hit, error, etc.)
- `GET /api/bot/kill-switch` — el EA consulta antes de operar
- `GET /api/news` — lee del cron que sincroniza ForexFactory

## Estado

🔧 A inicializar con `create-next-app`. Schema Prisma listo en `prisma/schema.prisma`.
