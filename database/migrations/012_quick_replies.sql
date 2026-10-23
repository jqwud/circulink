-- 012: residents message each other with quick replies only (Hiraman 2.0, batch 27).
--  * request_messages: a resident's message is a phrase id plus one picked value (server/src/phrases.js);
--    body holds staff free text, and the free text residents wrote before this change (kept read-only,
--    deleted a year after the request ends).
--  * reports.about_user_id: who a concern from a request is about, so repeated harassment concerns pause
--    that person's messages until staff look.
--  * users.messaging_paused: set by those concerns, lifted by staff.
--  * word_filter: words staff added to the kind-words check, on top of the built-in list in rules.js.

-- up
ALTER TABLE request_messages
  ADD COLUMN phrase_id VARCHAR(8) NULL AFTER sender_id,
  ADD COLUMN slot_value VARCHAR(20) NULL AFTER phrase_id,
  MODIFY body VARCHAR(500) NULL;
ALTER TABLE reports ADD COLUMN about_user_id INT NULL AFTER target_id;
ALTER TABLE users ADD COLUMN messaging_paused TINYINT(1) NOT NULL DEFAULT 0 AFTER suspended;
CREATE TABLE word_filter (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  word       VARCHAR(40) NOT NULL UNIQUE,
  added_by   INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_word_filter_user FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- down
DROP TABLE word_filter;
ALTER TABLE users DROP COLUMN messaging_paused;
ALTER TABLE reports DROP COLUMN about_user_id;
UPDATE request_messages SET body = CONCAT('[quick reply ', phrase_id, ']') WHERE body IS NULL;
ALTER TABLE request_messages
  MODIFY body VARCHAR(500) NOT NULL,
  DROP COLUMN slot_value,
  DROP COLUMN phrase_id;
