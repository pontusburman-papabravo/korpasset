#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

export DATABASE_URL="${DATABASE_URL:-postgresql://bilklar:bilklar@localhost:54329/bilklar_test}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required"
  exit 1
fi

if ! psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "PostgreSQL is not reachable and docker is unavailable"
    exit 1
  fi
  echo "Starting PostgreSQL via Docker Compose..."
  docker compose -f "$COMPOSE_FILE" up -d --wait
fi

echo "==> Reset database"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO bilklar;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "==> Apply migrations"
for sql in "$SCRIPT_DIR"/migrations/*.sql; do
  echo "  $(basename "$sql")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql"
done

echo "==> Verify enums and tables exist"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'users', 'auth_identities', 'driving_journeys', 'journey_collaborators',
    'journey_invitations', 'skills', 'skill_definitions', 'drives',
    'training_focus_items', 'drive_focus_skills', 'drive_observations',
    'interest_signups',
    'admin_users',
    'admin_password_reset_tokens',
    'resend_webhook_events',
    'product_events'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY expected_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Missing table: %', t;
    END IF;
  END LOOP;
END $$;
SQL

echo "==> Verify composite FK and journey isolation"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
-- Seed minimal data
INSERT INTO users (id, display_name, account_state) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Student', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Supervisor', 'guest');

INSERT INTO driving_journeys (id, student_user_id, transmission_scope)
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'automatic_only');

INSERT INTO journey_collaborators (journey_id, user_id, role)
VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'supervisor');

INSERT INTO skills (id, skill_key) VALUES
  ('44444444-4444-4444-8444-444444444444', 'car_control_braking');

INSERT INTO drives (id, journey_id, started_by_user_id, supervisor_user_id,
                    light_condition, weather_condition, traffic_level)
VALUES ('55555555-5555-4555-8555-555555555555',
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'daylight', 'dry', 'light');

-- Valid observation in same journey
INSERT INTO drive_observations (journey_id, drive_id, skill_id, observer_user_id,
                                source_type, assessment)
VALUES ('33333333-3333-4333-8333-333333333333',
        '55555555-5555-4555-8555-555555555555',
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
        'supervisor', 'with_support');

-- Cross-journey reference must fail
DO $$
BEGIN
  INSERT INTO driving_journeys (id, student_user_id)
  VALUES ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111');

  BEGIN
    INSERT INTO drive_observations (journey_id, drive_id, skill_id, observer_user_id,
                                    source_type, assessment)
    VALUES ('66666666-6666-4666-8666-666666666666',
            '55555555-5555-4555-8555-555555555555',
            '44444444-4444-4444-8444-444444444444',
            '22222222-2222-4222-8222-222222222222',
            'supervisor', 'needs_help');
    RAISE EXCEPTION 'Cross-journey FK should have been rejected';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Cross-journey FK correctly rejected';
  END;
END $$;
SQL

echo "==> Verify column-specific SET NULL on composite FK"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO training_focus_items (id, journey_id, skill_id, source, source_drive_id)
VALUES ('77777777-7777-4777-8777-777777777777',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        'supervisor',
        '55555555-5555-4555-8555-555555555555');

DELETE FROM drives WHERE id = '55555555-5555-4555-8555-555555555555';

DO $$
DECLARE
  nulled_drive_id uuid;
BEGIN
  SELECT source_drive_id INTO nulled_drive_id
  FROM training_focus_items
  WHERE id = '77777777-7777-4777-8777-777777777777';

  IF nulled_drive_id IS NOT NULL THEN
    RAISE EXCEPTION 'source_drive_id should be NULL after drive delete';
  END IF;
END $$;
SQL

echo "==> Verify negative constraints"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  BEGIN
    INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id,
                        started_at, ended_at, light_condition, weather_condition, traffic_level)
    VALUES ('33333333-3333-4333-8333-333333333333',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '2026-01-02 10:00:00+00', '2026-01-02 09:00:00+00',
            'daylight', 'dry', 'light');
    RAISE EXCEPTION 'ended_at < started_at should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ended_at constraint correctly enforced';
  END;

  BEGIN
    INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id,
                        distance_meters, light_condition, weather_condition, traffic_level)
    VALUES ('33333333-3333-4333-8333-333333333333',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            -1, 'daylight', 'dry', 'light');
    RAISE EXCEPTION 'negative distance_meters should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'distance_meters constraint correctly enforced';
  END;
END $$;
SQL

echo "==> Verify observation source rules"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO drives (id, journey_id, started_by_user_id, supervisor_user_id,
                    light_condition, weather_condition, traffic_level)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'daylight', 'dry', 'light');

DO $$
BEGIN
  BEGIN
    INSERT INTO drive_observations (journey_id, drive_id, skill_id, source_type, assessment)
    VALUES ('33333333-3333-4333-8333-333333333333',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '44444444-4444-4444-8444-444444444444',
            'external', 'needs_help');
    RAISE EXCEPTION 'external without external_source_ref should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'observation source rule correctly enforced';
  END;

  UPDATE drive_observations
     SET observer_user_id = NULL
   WHERE drive_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
END $$;
SQL

echo "==> Verify self-supersede rejected"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  obs_id uuid := '88888888-8888-4888-8888-888888888888';
BEGIN
  INSERT INTO drives (id, journey_id, started_by_user_id, supervisor_user_id,
                      light_condition, weather_condition, traffic_level)
  VALUES ('99999999-9999-4999-8999-999999999999',
          '33333333-3333-4333-8333-333333333333',
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          'daylight', 'dry', 'light');

  INSERT INTO drive_observations (id, journey_id, drive_id, skill_id, observer_user_id,
                                  source_type, assessment, supersedes_observation_id)
  VALUES (obs_id, '33333333-3333-4333-8333-333333333333',
          '99999999-9999-4999-8999-999999999999',
          '44444444-4444-4444-8444-444444444444',
          '22222222-2222-4222-8222-222222222222',
          'supervisor', 'independent', obs_id);
  RAISE EXCEPTION 'self-supersede should be rejected';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'self-supersede constraint correctly enforced';
END $$;
SQL

echo "==> Verify nullable drive context"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO drives (id, journey_id, started_by_user_id, supervisor_user_id)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222');

DO $$
DECLARE
  ctx light_condition;
BEGIN
  SELECT light_condition INTO ctx
  FROM drives
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  IF ctx IS NOT NULL THEN
    RAISE EXCEPTION 'light_condition should be NULL when not provided';
  END IF;
END $$;
SQL

echo "==> Verify invitation state constraints"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  BEGIN
    INSERT INTO journey_invitations (journey_id, invited_by_user_id, token_hash, expires_at, status,
                                     accepted_at, accepted_by_user_id)
    VALUES ('33333333-3333-4333-8333-333333333333',
            '11111111-1111-4111-8111-111111111111',
            'hash-accepted-without-fields',
            now() + interval '1 day',
            'accepted', NULL, NULL);
    RAISE EXCEPTION 'accepted without fields should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'invitation accepted_requires_fields correctly enforced';
  END;

  BEGIN
    INSERT INTO journey_invitations (journey_id, invited_by_user_id, token_hash, expires_at, status,
                                     accepted_at, accepted_by_user_id)
    VALUES ('33333333-3333-4333-8333-333333333333',
            '11111111-1111-4111-8111-111111111111',
            'hash-pending-with-fields',
            now() + interval '1 day',
            'pending', now(), '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'pending with accept fields should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'invitation pending_not_accepted correctly enforced';
  END;
END $$;
SQL

echo "==> Verify linear correction chain"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  original_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
BEGIN
  INSERT INTO drive_observations (id, journey_id, drive_id, skill_id, observer_user_id,
                                  source_type, assessment)
  VALUES (original_id, '33333333-3333-4333-8333-333333333333',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '44444444-4444-4444-8444-444444444444',
          '22222222-2222-4222-8222-222222222222',
          'supervisor', 'needs_help');

  INSERT INTO drive_observations (journey_id, drive_id, skill_id, observer_user_id,
                                  source_type, assessment, supersedes_observation_id)
  VALUES ('33333333-3333-4333-8333-333333333333',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '44444444-4444-4444-8444-444444444444',
          '22222222-2222-4222-8222-222222222222',
          'supervisor', 'with_support', original_id);

  BEGIN
    INSERT INTO drive_observations (journey_id, drive_id, skill_id, observer_user_id,
                                    source_type, assessment, supersedes_observation_id)
    VALUES ('33333333-3333-4333-8333-333333333333',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '44444444-4444-4444-8444-444444444444',
            '22222222-2222-4222-8222-222222222222',
            'supervisor', 'independent', original_id);
    RAISE EXCEPTION 'duplicate supersede should be rejected';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'linear correction chain correctly enforced';
  END;
END $$;
SQL

echo "==> Verify atomic invitation accept"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO journey_invitations (id, journey_id, invited_by_user_id, token_hash, expires_at)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        'hash-atomic-accept',
        now() + interval '1 day');

DO $$
DECLARE
  first_count integer;
  second_count integer;
BEGIN
  UPDATE journey_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = '22222222-2222-4222-8222-222222222222',
      updated_at = now()
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    AND status = 'pending'
    AND expires_at > now();

  GET DIAGNOSTICS first_count = ROW_COUNT;

  UPDATE journey_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = '22222222-2222-4222-8222-222222222222',
      updated_at = now()
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    AND status = 'pending'
    AND expires_at > now();

  GET DIAGNOSTICS second_count = ROW_COUNT;

  IF first_count != 1 OR second_count != 0 THEN
    RAISE EXCEPTION 'atomic accept failed: first=%, second=%', first_count, second_count;
  END IF;
END $$;
SQL

echo ""
echo "All migration verification checks passed."
