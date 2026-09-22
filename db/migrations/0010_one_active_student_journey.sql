-- At most one active student-owned B journey per person.
-- Supervisor collaborations on other journeys are unaffected.
-- completed and archived journeys do not count.
CREATE UNIQUE INDEX driving_journeys_one_active_student_b
  ON driving_journeys (student_user_id)
  WHERE status = 'active' AND licence_type = 'B';
