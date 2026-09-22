-- Where the family is in private practice. Used to suggest next focus
-- (just started vs already driving vs near test) without implying exam readiness.

BEGIN;

CREATE TYPE practice_stage AS ENUM (
  'unknown',
  'just_started',
  'building',
  'near_test'
);

ALTER TABLE driving_journeys
  ADD COLUMN practice_stage practice_stage NOT NULL DEFAULT 'unknown';

COMMIT;
