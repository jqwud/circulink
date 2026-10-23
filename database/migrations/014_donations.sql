-- 014: Donate / free to take (Hiraman 2.0, batch 29).
--  * items.listing_type: lend (as before) or donate. A donation has a claim_mode (first = first to claim,
--    barangay = staff choose, priority households first), a donation_status, and open_until (the day the
--    donor is asked what to do if nobody claimed it).
--  * donation_claims: one row per person who claimed or asked for a donation, with both sides' confirmations.
--  * users.priority_household: set by staff only, never shown to residents; the reason is not stored.
--    claim_paused_until / donate_paused_until: pauses after no-shows or problem donations (staff can lift).
--    thanks_opt_in: the donor agreed to be named (first name, purok) on the thank-you board.
--  * request_messages: a thread can belong to a donation claim instead of a borrow request.

-- up
ALTER TABLE items
  ADD COLUMN listing_type ENUM('lend','donate') NOT NULL DEFAULT 'lend' AFTER is_shelf,
  ADD COLUMN claim_mode ENUM('first','barangay') NULL AFTER listing_type,
  ADD COLUMN donation_status ENUM('open','reserved','given','to_shelf','withdrawn') NULL AFTER claim_mode,
  ADD COLUMN open_until DATE NULL AFTER donation_status,
  ADD COLUMN given_at DATETIME NULL AFTER open_until,
  ADD INDEX idx_items_donation (listing_type, donation_status);
CREATE TABLE donation_claims (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  item_id              INT NOT NULL,
  claimer_id           INT NOT NULL,
  status               ENUM('waiting','reserved','given','released','cancelled','no_show','problem') NOT NULL,
  reserved_until       DATETIME NULL,
  pickup_date          DATE NULL,
  donor_confirmed_at   DATETIME NULL,
  claimer_confirmed_at DATETIME NULL,
  staff_delivery       TINYINT(1) NOT NULL DEFAULT 0,
  chosen_by            INT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at            DATETIME NULL,
  INDEX idx_claims_item (item_id, status),
  INDEX idx_claims_claimer (claimer_id, status),
  CONSTRAINT fk_claims_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_claims_claimer FOREIGN KEY (claimer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_chosen_by FOREIGN KEY (chosen_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
ALTER TABLE users
  ADD COLUMN priority_household TINYINT(1) NOT NULL DEFAULT 0 AFTER lender_terms_accepted_at,
  ADD COLUMN claim_paused_until DATE NULL AFTER priority_household,
  ADD COLUMN donate_paused_until DATE NULL AFTER claim_paused_until,
  ADD COLUMN thanks_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER donate_paused_until;
ALTER TABLE request_messages
  MODIFY request_id INT NULL,
  ADD COLUMN donation_claim_id INT NULL AFTER request_id,
  ADD INDEX idx_msg_claim (donation_claim_id, id),
  ADD CONSTRAINT fk_msg_claim FOREIGN KEY (donation_claim_id) REFERENCES donation_claims(id) ON DELETE CASCADE;

-- down
DELETE FROM request_messages WHERE request_id IS NULL;
ALTER TABLE request_messages
  DROP FOREIGN KEY fk_msg_claim,
  DROP INDEX idx_msg_claim,
  DROP COLUMN donation_claim_id,
  MODIFY request_id INT NOT NULL;
ALTER TABLE users DROP COLUMN thanks_opt_in, DROP COLUMN donate_paused_until, DROP COLUMN claim_paused_until, DROP COLUMN priority_household;
DROP TABLE donation_claims;
ALTER TABLE items
  DROP INDEX idx_items_donation,
  DROP COLUMN given_at, DROP COLUMN open_until, DROP COLUMN donation_status, DROP COLUMN claim_mode, DROP COLUMN listing_type;
