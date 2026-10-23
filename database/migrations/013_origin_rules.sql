-- 013: Barangay vs neighbor items (Hiraman 2.0, batch 28).
--  * items.max_loan_days: a shorter loan limit staff set on a Barangay item (NULL = the normal limit).
--  * users.shelf_paused_until: no Barangay items until this day, after 2 late Barangay returns in 90 days.
--  * users.lender_terms_accepted_at: the one-time "neighbors share at their own risk" notice, accepted before
--    the first listing. Residents who already list items were told when they joined, so they count as accepted.
--  * requests.extended_at / extended_days: a loan can be extended once.
--  * ratings.ratee_id may be NULL: a borrower rating the barangay's service for a Barangay item.

-- up
ALTER TABLE items ADD COLUMN max_loan_days TINYINT NULL AFTER tier;
ALTER TABLE users
  ADD COLUMN shelf_paused_until DATE NULL AFTER messaging_paused,
  ADD COLUMN lender_terms_accepted_at DATETIME NULL AFTER shelf_paused_until;
UPDATE users u JOIN (SELECT DISTINCT owner_id FROM items WHERE owner_id IS NOT NULL) i ON i.owner_id = u.id
   SET u.lender_terms_accepted_at = NOW();
ALTER TABLE requests
  ADD COLUMN extended_at DATETIME NULL AFTER end_date,
  ADD COLUMN extended_days TINYINT NULL AFTER extended_at;
ALTER TABLE ratings MODIFY ratee_id INT NULL;

-- down
DELETE FROM ratings WHERE ratee_id IS NULL;
ALTER TABLE ratings MODIFY ratee_id INT NOT NULL;
ALTER TABLE requests DROP COLUMN extended_days, DROP COLUMN extended_at;
ALTER TABLE users DROP COLUMN lender_terms_accepted_at, DROP COLUMN shelf_paused_until;
ALTER TABLE items DROP COLUMN max_loan_days;
