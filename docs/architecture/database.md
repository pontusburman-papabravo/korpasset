# Database

## Val

**PostgreSQL 15+** — se [ADR-007](../decisions/ADR-007-postgresql-15.md).

Motivering: kolumnspecifik `ON DELETE SET NULL` på composite foreign keys, som krävs för journey-isolerade referenser med säker nullifiering vid radering.

## Migration

| Fil | Beskrivning |
| --- | --- |
| [`db/migrations/0001_initial.sql`](../../db/migrations/0001_initial.sql) | Initial schema — enums, tabeller, constraints, index |
| [`db/migrations/0002_interest_signups.sql`](../../db/migrations/0002_interest_signups.sql) | Intresseanmälningar till betan |
| [`db/migrations/0003_admin_auth.sql`](../../db/migrations/0003_admin_auth.sql) | Waitlist-admin (`admin_users`, reset-tokens) |
| [`db/migrations/0004_resend_webhook_events.sql`](../../db/migrations/0004_resend_webhook_events.sql) | Resend webhook-logg (`resend_webhook_events`) |
| [`db/migrations/0005_admin_audit_events.sql`](../../db/migrations/0005_admin_audit_events.sql) | Admin-audit för privileged writes (`admin_audit_events`) |
| [`db/migrations/0006_interest_signups_platform.sql`](../../db/migrations/0006_interest_signups_platform.sql) | Plattformsval i intresseanmälan (`platform_ios`, `platform_android`) |

Runtime-applikationen tillämpar samma filer via [`app/src/db/migrate.ts`](../../app/src/db/migrate.ts) och tabellen `schema_migrations`. Redan migrerade databaser stämplas, SQL körs inte om. Deploy: [Production](../operations/production.md).

Inget ORM. Raw SQL.

## Körning

### Docker Compose (utveckling och verifiering)

```bash
docker compose -f db/docker-compose.yml up -d
./db/verify-migration.sh
```

### Manuellt

```bash
psql "$DATABASE_URL" -f db/migrations/0001_initial.sql
```

## Journey isolation

Journey-isolering implementeras med **composite foreign keys**:

```sql
-- Exempel: observation → drive inom samma journey
FOREIGN KEY (drive_id, journey_id)
  REFERENCES drives (id, journey_id)
```

Tabeller med `(id, journey_id)` som composite unique key:

- `drives`
- `training_focus_items`
- `drive_observations`

## Column-specific SET NULL

PostgreSQL 15+ syntax för att nullifiera endast en kolumn vid DELETE:

```sql
FOREIGN KEY (source_drive_id, journey_id)
  REFERENCES drives (id, journey_id)
  ON DELETE SET NULL (source_drive_id)
```

Används för:

- `training_focus_items.source_drive_id`
- `drive_focus_skills.training_focus_item_id`
- `drive_observations.supersedes_observation_id`

## Append-only observations

Normal produktkod ska **INSERT** — inte UPDATE/DELETE — på `drive_observations`. Privileged GDPR/admin-process får hantera legitim radering/anonymisering.

## Verifiering

[`db/verify-migration.sh`](../../db/verify-migration.sh) testar:

- Tom databas → migration success
- Alla enums/tables/index skapas
- Composite FK fungerar
- Column-specific `SET NULL` fungerar
- Cross-journey references nekas
- Negativa constraints fungerar

## Relaterade dokument

- [Data model](../domain/data-model.md)
- [ADR-007: PostgreSQL 15](../decisions/ADR-007-postgresql-15.md)
