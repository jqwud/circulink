-- 004: how a dispute was settled.
--  * requests.dispute_outcome: fine (normal rules) / accident / borrower_fault / lost, chosen by staff.
--  * requests.settled_at: when staff settled it. The credit changes themselves are rows in credit_ledger.

-- up
ALTER TABLE requests
  ADD COLUMN dispute_outcome ENUM('fine','accident','borrower_fault','lost') NULL AFTER return_condition,
  ADD COLUMN settled_at DATETIME NULL AFTER dispute_outcome;

-- down
ALTER TABLE requests
  DROP COLUMN settled_at,
  DROP COLUMN dispute_outcome;
