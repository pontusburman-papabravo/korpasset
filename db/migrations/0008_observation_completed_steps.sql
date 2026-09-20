ALTER TABLE drive_observations
  ADD COLUMN completed_step_keys text[] NOT NULL DEFAULT '{}';
