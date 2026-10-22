-- 003: daily check-ins while an item is out, fair lateness, and dates for the request timeline.
--  * request_checkins: one answer per loan per day (Still with me / I returned it / There's a problem).
--  * requests.borrower_returned_at: when the borrower said "I returned it". Lateness is judged from this.
--  * requests.approved_at: when the request was approved, for the timeline.
--  * requests.checkin_since: the day the check-in clock starts. Loans already out start today,
--    so nobody is told they "missed" check-ins that did not exist yet.
--  * requests.checkin_reminded_on / checkin_alerted_on: so each reminder and alert is sent once.

-- up
ALTER TABLE requests
  ADD COLUMN approved_at DATETIME NULL AFTER note,
  ADD COLUMN borrower_returned_at DATETIME NULL AFTER returned_at,
  ADD COLUMN checkin_since DATE NULL AFTER borrower_returned_at,
  ADD COLUMN checkin_reminded_on DATE NULL AFTER checkin_since,
  ADD COLUMN checkin_alerted_on DATE NULL AFTER checkin_reminded_on;

UPDATE requests SET checkin_since = CURDATE() WHERE status = 'handed_over';

CREATE TABLE request_checkins (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  day        DATE NOT NULL,
  answer     ENUM('with_me','returned','problem') NOT NULL,
  note       VARCHAR(300) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkin_day (request_id, day),
  CONSTRAINT fk_checkin_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- down
DROP TABLE request_checkins;
ALTER TABLE requests
  DROP COLUMN checkin_alerted_on,
  DROP COLUMN checkin_reminded_on,
  DROP COLUMN checkin_since,
  DROP COLUMN borrower_returned_at,
  DROP COLUMN approved_at;
