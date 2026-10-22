-- 007: account safety.
--  * token_version: part of every login token. Logging out, changing the password or a staff reset adds 1,
--    which ends every older session of that account.
--  * must_change_password: set by a staff-assisted reset; the person picks a new password at the next login.

-- up
ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;

-- down
ALTER TABLE users
  DROP COLUMN must_change_password,
  DROP COLUMN token_version;
