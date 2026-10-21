-- 002: what the scheduled jobs need.
--  * requests can now be "expired": a pending request nobody answered in 7 days, or an approved one never picked up.
--  * users.verification_decided_at: when staff approved or rejected the ID, so the ID photo can be deleted 7 days later.
--    Existing decided accounts start their 7 days now, so no photo disappears without notice.
--  * job_runs: when each job last ran, last succeeded, and its last result or error.

-- up
ALTER TABLE requests MODIFY status ENUM('pending','approved','rejected','cancelled','handed_over','closed','disputed','expired') NOT NULL DEFAULT 'pending';

ALTER TABLE users ADD COLUMN verification_decided_at DATETIME NULL AFTER reject_reason;
UPDATE users SET verification_decided_at = NOW() WHERE verification_status IN ('approved','rejected');

CREATE TABLE job_runs (
  name        VARCHAR(60) PRIMARY KEY,
  last_run_at DATETIME NULL,
  last_ok_at  DATETIME NULL,
  last_result VARCHAR(255) NULL,
  last_error  VARCHAR(255) NULL
) ENGINE=InnoDB;

-- down
DROP TABLE job_runs;
ALTER TABLE users DROP COLUMN verification_decided_at;
UPDATE requests SET status = 'cancelled' WHERE status = 'expired';
ALTER TABLE requests MODIFY status ENUM('pending','approved','rejected','cancelled','handed_over','closed','disputed') NOT NULL DEFAULT 'pending';
