-- Account-deletion hardening: historical drive/observation attribution may
-- outlive the person. After deletion those columns are nulled so remaining
-- journey history cannot be joined back to the deleted users row.

BEGIN;

ALTER TABLE drives
  ALTER COLUMN started_by_user_id DROP NOT NULL,
  ALTER COLUMN supervisor_user_id DROP NOT NULL;

ALTER TABLE drives
  DROP CONSTRAINT drives_started_by_user_id_fkey,
  DROP CONSTRAINT drives_supervisor_user_id_fkey;

ALTER TABLE drives
  ADD CONSTRAINT drives_started_by_user_id_fkey
    FOREIGN KEY (started_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT drives_supervisor_user_id_fkey
    FOREIGN KEY (supervisor_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE drive_observations
  DROP CONSTRAINT drive_observations_observer_user_id_fkey;

ALTER TABLE drive_observations
  ADD CONSTRAINT drive_observations_observer_user_id_fkey
    FOREIGN KEY (observer_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE drive_observations
  DROP CONSTRAINT drive_observations_source_rules;

ALTER TABLE drive_observations
  ADD CONSTRAINT drive_observations_source_rules CHECK (
    CASE source_type
      WHEN 'system' THEN true
      WHEN 'external' THEN external_source_ref IS NOT NULL
      WHEN 'supervisor' THEN true
      WHEN 'student' THEN true
      WHEN 'driving_school' THEN
        observer_user_id IS NOT NULL OR external_source_ref IS NOT NULL
    END
  );

COMMIT;
