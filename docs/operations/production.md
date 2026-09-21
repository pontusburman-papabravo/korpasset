# Production

Minsta produktionsbara körning för Körpassets första beta. En Fastify-process + PostgreSQL 15. Ingen microservice-split.

Git: https://github.com/pontusburman-papabravo/korpasset

## Canonical routing

Ett origin:

| URL | Vad |
| --- | --- |
| `https://korpasset.se` | Landning + intresseanmälan. Skapar **inte** produktkonto. |
| `https://korpasset.se/onboarding` | Slice-fallback för att skapa elevresa. Inte betans kontomodell. |
| `https://korpasset.se/invite/<token>` | Canonical invitation-länk; i beta öppnas den i appen |
| `https://korpasset.se/integritet` `/villkor` `/kontakt` `/radera-konto` | Legal. `/radera-konto` är Play Consoles länk för kontoradering |
| `https://korpasset.se/admin` | Waitlist-admin (e-post + lösenord, skapas med `admin:create`) |
| `https://korpasset.se/health` | Health, ingen auth |
| `https://korpasset.se/api/resend/webhook` | Resend-händelser (Svix-signatur, ingen användar-auth) |

Ingen `app.`-subdomän i första betan. Samma host förenklar cookies, QR, SMS och en Capacitor-shell som laddar produktionens origin. Produktkonton skapas i den shellen via Apple och Google, inte på landningen.

Invitationer byggs från `APP_BASE_URL`. Den **måste** vara `https://korpasset.se` i produktion — annars pekar QR mot localhost.

## Vad som måste sättas utanför repo

| Variabel | Krav |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres 15-anslutning. Inget default i produktion. |
| `SESSION_SECRET` | Minst 32 tecken. Inte utvecklingsdefaulten. |
| `APP_BASE_URL` | `https://korpasset.se` |
| `PORT` | Valfritt, default `3000` |
| `RESEND_API_KEY` | Valfritt men krävs för att faktiskt skicka admin-resetmejl. Utan nyckel loggas felet och användaren får samma neutrala text. |
| `RESEND_WEBHOOK_SECRET` | Valfritt. Svix-signing secret från Resend → Webhooks. Utan secret svarar `POST /api/resend/webhook` 503. |
| `EMAIL_FROM` | Valfritt. Default `Körpasset <support@korpasset.se>` |

Första waitlist-admin skapas **inte** via env och inte via publik signup:

```bash
# Lokal utveckling
cd app && npm run admin:create -- --email you@korpasset.se

# Produktion (efter image-build, interaktivt)
node dist/cli/create-admin.js --email you@korpasset.se
```

Skriptet frågar efter lösenord (minst 12 tecken), hashar med Argon2id och skriver till `admin_users`. Inget plaintext-lösen i env. Utan minst en aktiv admin-rad svarar `/admin` 404.

### Admin-session och reset

- Cookie `korpasset_admin`: HttpOnly, SameSite=Lax, Path=`/admin`, Secure när `APP_BASE_URL` är https, 12 timmar.
- Innehåll: HMAC-signerad `{ adminUserId, issuedAt }` mot `SESSION_SECRET`. Inte `{ admin: true }`.
- Lösenord hashas med Argon2id (`@node-rs/argon2`, m=19456, t=2, p=1).
- Reset-token: 32 slumpbytes, bara hashen i DB, 30 minuter, one-time. URL byggs från `APP_BASE_URL`, inte `Host`.
- Ordning: token skapas i DB, sedan skickas mejl. Misslyckad send loggas utan token/lösenord. Publikt svar är alltid neutralt.
- Password reset sätter `password_changed_at` så äldre admin-cookies slutar gälla.

### Resend webhook

Samma mönster som My Starday: `POST /api/resend/webhook`.

1. Deploya appen med `RESEND_WEBHOOK_SECRET`.
2. I Resend Dashboard → Webhooks, skapa en webhook mot `https://korpasset.se/api/resend/webhook`.
3. Events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`. Inte `email.opened` / `email.clicked` — resetmejl är text-only och tracking är av på `korpasset.se`.
4. Sätt signing secret i `RESEND_WEBHOOK_SECRET` (`whsec_…`).

Endpointen verifierar Svix-signatur mot raw body, sparar `event_type` + `email_id` i `resend_webhook_events`, och loggar bounce/complaint utan mottagaradress. Samma Svix-id skrivs inte om (Resend-retries).

Resend-webhooks är per konto. Om Körpasset delar Resend-projekt med My Starday får båda endpointerna alla mejlhändelser. Körpasset ignorerar okända typer och lagrar bara id. My Starday kan fortfarande se Körpasset-events på sin webhook.

### Rate limit för intresseanmälan

`POST /interest` tillåter 8 försök / 10 minuter per IP i app-minnet. I produktion är `trustProxy` på så Fastify använder `X-Forwarded-For` från Caddy. Det är inte en global WAF; det stoppar enkel botspam. Admin-login 10/15 min och forgot-password 5/15 min per IP.

`ADMIN_PASSWORD` används inte längre.

Appen vägrar starta i `NODE_ENV=production` om secrets saknas, om `SESSION_SECRET` är dev-default, eller om `APP_BASE_URL` inte är https (`ALLOW_HTTP=true` endast för lokal prod-lik körning).

Session-cookien `bilklar_session` sätts med `Secure` när `APP_BASE_URL` är https.

Mall: [`app/.env.example`](../../app/.env.example). Committa aldrig `.env`.

## Image och start

Från reporoot:

```bash
docker build -f deploy/Dockerfile -t korpasset-app .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="$DATABASE_URL" \
  -e SESSION_SECRET="$SESSION_SECRET" \
  -e APP_BASE_URL=https://korpasset.se \
  korpasset-app
```

På den befintliga VPS:en: [`docs/operations/vps-access.md`](vps-access.md) och
`docker compose --project-directory deploy -f deploy/docker-compose.yml`.

Startsekvens i containern:

1. `assertProductionConfig`
2. `applyMigrations` (idempotent)
3. taxonomy seed (idempotent)
4. lyssna på `0.0.0.0:$PORT`

Manuell migrate utan att starta appen (dev):

```bash
cd app
npm run migrate
```

Befintliga databaser där `0001_initial.sql` redan körts stämplas i `schema_migrations` utan att SQL körs om.

## Health och loggning

- `GET /health` → `200 { status: "ok" }` om `SELECT 1` mot Postgres lyckas, annars `503`.
- Svaret innehåller `x-request-id`. Klienten kan skicka samma header.
- Produktion loggar JSON via Fastify. Cookies, `Authorization` och invitation-tokens i `/invite/...` redakteras.
- `uncaughtException` / `unhandledRejection` loggas och processen avslutas.

Inga hemligheter, invitation-tokens eller personnamn ska läggas till i loggar.

## Backup och restore

Ta dump **före** migrate som ändrar schema, och rutinmässigt (minst dagligen när beta är live).

```bash
# Backup (custom format, lämpligt för pg_restore)
pg_dump -Fc "$DATABASE_URL" -f "korpasset-$(date -u +%Y%m%dT%H%M%SZ).dump"

# Restore mot tom eller återställd databas
pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" korpasset-YYYYMMDD.dump
```

Efter restore: starta appen (migrate är no-op om `schema_migrations` följde med dump:en). Verifiera `GET /health`.

Lagra dump utanför apprecot. Innehållet är personuppgifter (namn, journey-data).

## Test vs production

| | Lokal test | Produktion |
| --- | --- | --- |
| Postgres | embedded-postgres i `npm test`, eller `db/docker-compose.yml` | Managed Postgres 15 |
| Secrets | repo-defaults tillåtna | env, inga defaults |
| `APP_BASE_URL` | `http://localhost:3000` | `https://korpasset.se` |
| Cookie `Secure` | av | på |
| Logger | av | på, redacted |

`db/verify-migration.sh` är fortfarande för schema-invarianter mot en nollställd databas. Den är inte deploy-sökvägen.

## Host och DNS

Live är Ubuntu 24 + Docker Compose + Caddy på `korpasset.se`. Se
[`vps-access.md`](vps-access.md). DNS och TLS finns redan. Rotera inte
databaslösen eller `SESSION_SECRET` vid redeploy.
