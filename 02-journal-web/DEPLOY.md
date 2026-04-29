# Deploy a Vercel

Guía paso a paso para llevar `02-journal-web` a producción.

## 1. Preparar el repo

- Asegúrate de que el repo esté en GitHub (privado).
- El root del proyecto es `02-journal-web/` (no la raíz del monorepo).

## 2. Importar en Vercel

1. Entra a https://vercel.com/new
2. Selecciona el repositorio
3. **Root Directory**: `02-journal-web`
4. **Framework Preset**: `Next.js` (autodetectado)
5. **Build Command**: `prisma generate && next build` (ya viene en `package.json` y `vercel.json`)
6. **Output Directory**: `.next` (default)
7. **Install Command**: `npm install` (default)

## 3. Variables de entorno

Copiar de tu `.env` local TODAS las variables. Para producción:

| Variable                          | Notas                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                    | Postgres con `?sslmode=require`. Neon recomendado.            |
| `NEXTAUTH_SECRET`                 | `openssl rand -base64 32`                                     |
| `NEXTAUTH_URL`                    | URL pública de Vercel (ej: `https://gio-journal.vercel.app`). |
| `BOT_API_KEY`                     | `openssl rand -hex 32`. El EA en MQL5 lo usa.                 |
| `CRON_SECRET`                     | `openssl rand -hex 32`. Vercel envía `Bearer $CRON_SECRET`.   |
| `FOREXFACTORY_XML_URL`            | `https://nfs.faireconomy.media/ff_calendar_thisweek.xml`      |
| `ALLOW_REGISTRATION`              | `"false"` en prod.                                            |
| `NEXT_PUBLIC_ALLOW_REGISTRATION`  | `"false"` en prod.                                            |
| `RESEND_API_KEY`                  | Opcional.                                                     |
| `TELEGRAM_BOT_TOKEN`              | Opcional.                                                     |
| `TELEGRAM_CHAT_ID`                | Opcional.                                                     |

> **Importante**: marca todas como `Production`, `Preview` y `Development` según corresponda. `NEXTAUTH_URL` debe coincidir con la URL de cada entorno.

## 4. Deploy

- Vercel construirá usando `prisma generate && next build`.
- `postinstall` ejecutará `prisma generate` automáticamente al instalar dependencias.

## 5. Post-deploy

1. **Smoke-test**:
   - `https://<tu-dominio>/login` → entrar con credenciales.
   - `https://<tu-dominio>/dashboard` → carga sin errores.
2. **Cron**:
   - El cron `/api/cron/sync-news` corre diario a las 06:00 UTC (definido en `vercel.json`).
   - Para disparar manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/sync-news`
3. **Bot endpoint**:
   - El EA debe llamar `https://<tu-dominio>/api/bot/trade` con header `X-Bot-Api-Key: $BOT_API_KEY`.
   - Polling de kill-switch: `https://<tu-dominio>/api/bot/kill-switch` con el mismo header.
4. **Dominio personalizado** (opcional):
   - Vercel → Project → Settings → Domains. Añade `tu-dominio.com`.
   - Actualiza `NEXTAUTH_URL` con el dominio nuevo.

## 6. Operaciones recurrentes

- **Migraciones**: cuando cambies el schema, corre `prisma migrate deploy` desde un job de Vercel o localmente con la `DATABASE_URL` de producción.
- **Seed inicial** (solo primera vez en prod):
  ```bash
  DATABASE_URL="<prod-url>" npm run create-user -- <email> <password>
  DATABASE_URL="<prod-url>" npm run db:seed
  ```
  El seed es idempotente: solo añade lo que falta.
- **Rotar `BOT_API_KEY`**: actualiza la env var en Vercel y en el EA. No requiere redeploy si el EA lo lee dinámicamente.
- **Rollback**: Vercel → Deployments → "Promote to Production" sobre un deploy anterior.
