# Körpasset

**Övningskör med en plan.**

Körpasset är en B2C-app för svensk privat övningskörning som håller ihop elevens träning mellan en eller flera handledare.

Kärnfrågor:

- **Vad ska vi träna på idag?**
- **Hur gick det?**
- **Vad bör vi träna på nästa gång?**

Webb: https://korpasset.se  
Källkod: https://github.com/pontusburman-papabravo/korpasset

v1 är strikt fokuserad på den praktiska privata övningskörningen.

## Dokumentation

**Publik kravspecifikation (hela v1):** [docs/kravspec.md](docs/kravspec.md)

### Produkt

- [Vision](docs/product/vision.md)
- [MVP v1](docs/product/mvp-v1.md)
- [Produktprinciper](docs/product/product-principles.md)
- [Onboarding & handoff](docs/product/onboarding-handoff.md)

### Domän

- [Skill Taxonomy v1](docs/domain/skill-taxonomy.md) — 38 skills, status: **Canonical**
- [skill-taxonomy-v1.json](docs/domain/skill-taxonomy-v1.json) — maskinläsbar seed-input
- [Data model](docs/domain/data-model.md)
- [Progression model](docs/domain/progression-model.md)

### Arkitektur

- [Database](docs/architecture/database.md)
- [Production](docs/operations/production.md) — env, health, backup/restore
- [VPS-access](docs/operations/vps-access.md) — korpasset.se host, Compose, redeploy
- [Apple Developer](docs/operations/apple-developer.md) — App ID och SKU `se.korpasset.app`

### Beslut (ADR)

- [ADR-001: Student-owned journey](docs/decisions/ADR-001-student-owned-journey.md)
- [ADR-002: Actor/auth separation](docs/decisions/ADR-002-actor-auth-separation.md)
- [ADR-003: Skill/context separation](docs/decisions/ADR-003-skill-context-separation.md)
- [ADR-004: Append-only observations](docs/decisions/ADR-004-append-only-observations.md)
- [ADR-005: Observation/focus separation](docs/decisions/ADR-005-observation-focus-separation.md)
- [ADR-006: B2C-first](docs/decisions/ADR-006-b2c-first.md)
- [ADR-007: PostgreSQL 15](docs/decisions/ADR-007-postgresql-15.md)
- [ADR-008: App-only konton via Apple och Google](docs/decisions/ADR-008-app-oauth-accounts.md)

## Databas

PostgreSQL 15+. Initial migration: [`db/migrations/0001_initial.sql`](db/migrations/0001_initial.sql).

```bash
docker compose -f db/docker-compose.yml up -d
./db/verify-migration.sh
```

## App (vertical slice v1)

Minimal webbapp i [`app/`](app/) — elev + handledare från invitation till första körpasset.

```bash
# 1. Starta PostgreSQL
docker compose -f db/docker-compose.yml up -d
./db/verify-migration.sh

# 2. Starta appen
cd app
npm install
npm run dev
```

Öppna `http://localhost:3000` i två olika webbläsare/sessioner för att testa elev- och handledarflödet.

Första waitlist-admin (ingen publik signup):

```bash
cd app
npm run admin:create -- --email you@korpasset.se
```

## Produktion

Se [Production](docs/operations/production.md) och [VPS-access](docs/operations/vps-access.md). Kort:

```bash
docker build -f deploy/Dockerfile -t korpasset-app .
# Kräver DATABASE_URL, SESSION_SECRET, APP_BASE_URL=https://korpasset.se
# Första admin: node dist/cli/create-admin.js --email you@korpasset.se
# Mejlreset: RESEND_API_KEY (valfritt tills reset ska fungera)
# Resend webhook: RESEND_WEBHOOK_SECRET + POST https://korpasset.se/api/resend/webhook
```

Health: `GET /health` → `{ "status": "ok" }`.

## Status

Canonical produkt- och databasgrund. Första vertical slice: journey → invitation → körpass → observation → rekommendation. Publik landning med intresseanmälan på `https://korpasset.se`. Nästa fas: **Beta Readiness** (app-shell, Apple/Google-konto enligt [ADR-008](docs/decisions/ADR-008-app-oauth-accounts.md), legal i produktion, observability, iOS/Android).
