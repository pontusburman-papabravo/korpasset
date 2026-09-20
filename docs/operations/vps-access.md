# VPS-access för Körpasset

Inga nya molnkonton. Git är
[`pontusburman-papabravo/korpasset`](https://github.com/pontusburman-papabravo/korpasset).
Servern är Ubuntu 24 på `188.66.62.46`. DNS pekar `korpasset.se` och
`*.korpasset.se` dit.

App-koden som ska köras är **dagens `main`** (landning, waitlist-admin, Resend
webhook, migrationer 0001–0004). Deploy-filerna i den här mappen gör `main`
deploybar utan att återinföra applikationskod från den gamla bootstrap-PR:n.

## Live-server (redan bootstrappad)

Första installationen är gjord. Kör **inte** `vps-bootstrap.sh` om igen — det
är för tomma maskiner. Rotera inte `POSTGRES_PASSWORD` eller `SESSION_SECRET`
i `deploy/.env`.

Redeploy av en SHA som innehåller `deploy/`:

```bash
export VPS_APP_PATH=/var/www/korpasset
export DEPLOY_SHA=<40-hex-sha>
bash scripts/vps-deploy-revision.sh
```

Scriptet checkar ut SHA:n och kör Compose med `--project-directory deploy` så
befintliga volymer (`deploy_postgres_data`) återanvänds. Appen kör
`applyMigrations` vid start: 0001 stämpas om `users` redan finns, sedan
appliceras 0002–0004.

Före checkout vägrar scriptet SHA:n om `deploy/docker-compose.yml`,
`deploy/Dockerfile` eller `scripts/vps-deploy-revision.sh` saknas.

Sätt **icke-tomma** värden i befintlig `/var/www/korpasset/deploy/.env` före
deploy. Tom `RESEND_API_KEY` eller `RESEND_WEBHOOK_SECRET` avbryter
deploy (password reset och webhook ska fungera i public beta). Rotera inte
`POSTGRES_PASSWORD` eller `SESSION_SECRET`.

```
RESEND_API_KEY=<befintlig nyckel>
RESEND_WEBHOOK_SECRET=<befintlig signing secret>
EMAIL_FROM=Körpasset <support@korpasset.se>
```

Första admin skapas i containern efter migrate:

```bash
docker compose --project-directory /var/www/korpasset/deploy \
  -f /var/www/korpasset/deploy/docker-compose.yml \
  exec -it app node dist/cli/create-admin.js --email pontus.burman@papabravo.se
```

Agent-SSH: `scripts/vps-ssh.sh check`.

## Tom server (första boot)

Logga in som root på en **ny** Ubuntu 24 (inte den live VPS:en om den redan
kör). Klistra in:

```bash
curl -fsSL https://raw.githubusercontent.com/pontusburman-papabravo/korpasset/main/scripts/vps-bootstrap.sh | bash
```

Scriptet gör:

1. Docker, UFW (22/80/443), unattended-upgrades
2. Linux-användaren `deploy` med sudo
3. SSH-nycklar för Cursor-agenten och GitHub Actions (`/root/korpasset-access/`)
4. Klonar korpasset till `/var/www/korpasset` och checkar ut `main` (måste ha `deploy/`)
5. Skapar `deploy/.env` om filen saknas (skriver inte över en befintlig)
6. Startar Postgres 15 + appen + Caddy (Let's Encrypt för `korpasset.se`)

Valfritt, om du har en GitHub-token med rätt att skriva secrets:

```bash
GH_TOKEN=… curl -fsSL https://raw.githubusercontent.com/pontusburman-papabravo/korpasset/main/scripts/vps-bootstrap.sh | bash
```

Då sätts GitHub environment `vps` automatiskt. Extra egen SSH-nyckel:

```bash
EXTRA_SSH_PUBKEY='ssh-ed25519 AAAA… din-mac' bash scripts/vps-bootstrap.sh
```

## Vad som inte kan göras från servern

Cursor-secrets injiceras bara vid **start** av en agent. Efter scriptet:

1. `cat /root/korpasset-access/cursor_agent` → Cursor runtime secret `VPS_SSH_KEY`
2. Environment variables: `VPS_HOST=188.66.62.46`, `VPS_USER=deploy`, `VPS_APP_PATH=/var/www/korpasset`
3. Starta en **ny** agent (den här körningen ser inte secret:en)

Klistra inte in den privata nyckeln i chatten.

Cursor runtime secrets kan flatten:a `VPS_SSH_KEY` till en rad (mellanslag
istället för PEM-radbrytningar) och lämna inledande mellanslag på
`VPS_HOST` / `VPS_USER` / `VPS_APP_PATH`. `scripts/vps-ssh.sh` strippar
värdena och rekonstruerar OpenSSH-PEM (body 70 tecken). Nyckeln ska inte
in i git.

| Vem | Hur |
| --- | --- |
| **Du som root** | Inleed-konsol, en gång, kör bootstrap på tom maskin |
| **Cursor-agent** | SSH som `deploy` med `VPS_SSH_KEY` |
| **Git på servern** | `git fetch` mot HTTPS, read-only, inget bot-konto |
| **GitHub Actions** | SSH som `deploy` med nyckeln i environment `vps` |

Skapa inte extra GitHub-användare, Docker Hub, Cloudflare eller Let's Encrypt-konto.
