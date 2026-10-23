-- 016: the Tiwala (trust) score in shadow mode (Hiraman 2.0, batch 32; design spec section 8).
--  * trust_scores: one row per resident per period: 'live' (refreshed nightly) and a snapshot per quarter
--    (e.g. '2026-Q4'). parts = how the score was made, so every number can be explained.
--  * users.tiwala_frozen_until: score held at 0 after staff confirm collusion (180 days).
--  * items.removed_at: when a listing was removed, so a removal by staff counts in the 90-day window.

-- up
CREATE TABLE trust_scores (
  user_id           INT NOT NULL,
  period            VARCHAR(10) NOT NULL,
  score             TINYINT UNSIGNED NOT NULL,
  tier              VARCHAR(10) NOT NULL,
  parts             JSON NOT NULL,
  signals           JSON NOT NULL,
  needs_staff_check TINYINT(1) NOT NULL DEFAULT 0,
  counted_loans     INT NOT NULL DEFAULT 0,
  computed_on       DATE NOT NULL,
  PRIMARY KEY (user_id, period),
  INDEX idx_trust_period (period, score),
  CONSTRAINT fk_trust_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
ALTER TABLE users ADD COLUMN tiwala_frozen_until DATE NULL AFTER simple_mode;
ALTER TABLE items ADD COLUMN removed_at DATETIME NULL AFTER removed_by;

-- down
ALTER TABLE items DROP COLUMN removed_at;
ALTER TABLE users DROP COLUMN tiwala_frozen_until;
DROP TABLE trust_scores;
