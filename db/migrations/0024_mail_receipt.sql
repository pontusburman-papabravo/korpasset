-- Delivery and open times for product mail, keyed by the provider message id.
-- The address stays off these rows. Older rows without an id stay unknown.

BEGIN;

ALTER TABLE account_help_emails
  ADD COLUMN provider_message_id text,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN opened_at timestamptz,
  ADD COLUMN bounced_at timestamptz;

ALTER TABLE journey_weekly_emails
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN opened_at timestamptz,
  ADD COLUMN bounced_at timestamptz;

CREATE INDEX idx_account_help_emails_provider_message_id
  ON account_help_emails (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX idx_journey_weekly_emails_provider_message_id
  ON journey_weekly_emails (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

UPDATE account_help_emails AS mail
SET delivered_at = src.at
FROM (
  SELECT email_id, min(received_at) AS at
  FROM resend_webhook_events
  WHERE event_type = 'email.delivered' AND email_id IS NOT NULL
  GROUP BY email_id
) AS src
WHERE mail.provider_message_id = src.email_id
  AND mail.delivered_at IS NULL;

UPDATE account_help_emails AS mail
SET opened_at = src.at
FROM (
  SELECT email_id, min(received_at) AS at
  FROM resend_webhook_events
  WHERE event_type = 'email.opened' AND email_id IS NOT NULL
  GROUP BY email_id
) AS src
WHERE mail.provider_message_id = src.email_id
  AND mail.opened_at IS NULL;

UPDATE account_help_emails AS mail
SET bounced_at = src.at
FROM (
  SELECT email_id, min(received_at) AS at
  FROM resend_webhook_events
  WHERE event_type = 'email.bounced' AND email_id IS NOT NULL
  GROUP BY email_id
) AS src
WHERE mail.provider_message_id = src.email_id
  AND mail.bounced_at IS NULL;

UPDATE journey_weekly_emails AS mail
SET delivered_at = src.at
FROM (
  SELECT email_id, min(received_at) AS at
  FROM resend_webhook_events
  WHERE event_type = 'email.delivered' AND email_id IS NOT NULL
  GROUP BY email_id
) AS src
WHERE mail.provider_message_id = src.email_id
  AND mail.delivered_at IS NULL;

UPDATE journey_weekly_emails AS mail
SET opened_at = src.at
FROM (
  SELECT email_id, min(received_at) AS at
  FROM resend_webhook_events
  WHERE event_type = 'email.opened' AND email_id IS NOT NULL
  GROUP BY email_id
) AS src
WHERE mail.provider_message_id = src.email_id
  AND mail.opened_at IS NULL;

UPDATE journey_weekly_emails AS mail
SET bounced_at = src.at
FROM (
  SELECT email_id, min(received_at) AS at
  FROM resend_webhook_events
  WHERE event_type = 'email.bounced' AND email_id IS NOT NULL
  GROUP BY email_id
) AS src
WHERE mail.provider_message_id = src.email_id
  AND mail.bounced_at IS NULL;

COMMIT;
