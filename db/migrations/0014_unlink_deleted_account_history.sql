-- Account-deletion hardening: historical drive/observation attribution may
-- outlive the person. After deletion those user-id columns are nulled *and*
-- marked deleted so remaining journey history cannot be joined back to users.
--
-- NULL attribution is not enough on its own. Living student/supervisor
-- observations and every new drive still require an actor-id. The deleted
-- flag is the only way a missing actor-id is valid: "actor existed and was
-- unlinked", never "row was created without an actor".

BEGIN;

ALTER TABLE drives
  ADD COLUMN started_by_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN supervisor_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE drives
  ALTER COLUMN started_by_user_id DROP NOT NULL,
  ALTER COLUMN supervisor_user_id DROP NOT NULL;

ALTER TABLE drives
  ADD CONSTRAINT drives_started_by_attribution CHECK (
    (started_by_user_id IS NOT NULL AND started_by_deleted = false)
    OR (started_by_user_id IS NULL AND started_by_deleted = true)
  ),
  ADD CONSTRAINT drives_supervisor_attribution CHECK (
    (supervisor_user_id IS NOT NULL AND supervisor_deleted = false)
    OR (supervisor_user_id IS NULL AND supervisor_deleted = true)
  );

ALTER TABLE drive_observations
  ADD COLUMN observer_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE drive_observations
  DROP CONSTRAINT drive_observations_source_rules;

ALTER TABLE drive_observations
  ADD CONSTRAINT drive_observations_source_rules CHECK (
    CASE source_type
      WHEN 'system' THEN true
      WHEN 'external' THEN external_source_ref IS NOT NULL
      WHEN 'supervisor' THEN observer_user_id IS NOT NULL OR observer_deleted
      WHEN 'student' THEN observer_user_id IS NOT NULL OR observer_deleted
      WHEN 'driving_school' THEN
        observer_user_id IS NOT NULL
        OR external_source_ref IS NOT NULL
        OR observer_deleted
    END
  );

ALTER TABLE drive_observations
  ADD CONSTRAINT drive_observations_observer_attribution CHECK (
    CASE
      WHEN observer_user_id IS NOT NULL THEN observer_deleted = false
      WHEN observer_deleted THEN true
      ELSE source_type IN ('system', 'external', 'driving_school')
    END
  );

COMMIT;
