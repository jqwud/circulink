-- 010: a review state for listings, so staff can hide one and (batch 19) the system can hold a suspicious one.
--  * review_status: ok (neighbors see it), hidden (hidden by staff), flagged (held by the automatic checks
--    until staff decide). Only ok listings are shown, opened or booked by neighbors; the owner always sees theirs.
--  * review_note: the reason shown to the owner. review_flags: what the automatic checks found.

-- up
ALTER TABLE items
  ADD COLUMN review_status ENUM('ok','flagged','hidden') NOT NULL DEFAULT 'ok' AFTER removed_by,
  ADD COLUMN review_note VARCHAR(255) NULL AFTER review_status,
  ADD COLUMN review_flags VARCHAR(255) NULL AFTER review_note,
  ADD COLUMN reviewed_by INT NULL AFTER review_flags,
  ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by,
  ADD INDEX idx_items_review (review_status),
  ADD CONSTRAINT fk_items_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- down
ALTER TABLE items
  DROP FOREIGN KEY fk_items_reviewed_by,
  DROP INDEX idx_items_review,
  DROP COLUMN reviewed_at,
  DROP COLUMN reviewed_by,
  DROP COLUMN review_flags,
  DROP COLUMN review_note,
  DROP COLUMN review_status;
