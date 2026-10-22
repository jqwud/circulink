-- 006: privacy (RA 10173).
--  * privacy_version / privacy_accepted_at: which privacy notice the person agreed to, and when.
--    People who joined before this are asked once, the next time they open the app.
--  * id_consent_at: when they agreed that staff may view their ID photo.
--  * deletion_requested_at: the person asked for their account to be deleted.
--  * deleted_at: an admin deleted it; the row stays without personal data so loan records still add up.

-- up
ALTER TABLE users
  ADD COLUMN privacy_version VARCHAR(20) NULL,
  ADD COLUMN privacy_accepted_at DATETIME NULL,
  ADD COLUMN id_consent_at DATETIME NULL,
  ADD COLUMN deletion_requested_at DATETIME NULL,
  ADD COLUMN deleted_at DATETIME NULL;

-- down
ALTER TABLE users
  DROP COLUMN deleted_at,
  DROP COLUMN deletion_requested_at,
  DROP COLUMN id_consent_at,
  DROP COLUMN privacy_accepted_at,
  DROP COLUMN privacy_version;
