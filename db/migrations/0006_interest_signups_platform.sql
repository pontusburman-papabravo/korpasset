-- Platform choice for beta waitlist (iPhone / Android).

BEGIN;

ALTER TABLE interest_signups
  ADD COLUMN platform_ios boolean NOT NULL DEFAULT false,
  ADD COLUMN platform_android boolean NOT NULL DEFAULT false;

COMMIT;
