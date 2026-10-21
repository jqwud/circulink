-- 001: guard rails. The code already follows these rules; now the database enforces them too,
-- so a bug or a manual edit cannot create negative balances, impossible dates or orphan rows.
-- Before applying to a database with real data, each of these should return 0:
--   SELECT COUNT(*) FROM users WHERE credits < 0;
--   SELECT COUNT(*) FROM requests WHERE end_date < start_date OR credit_cost < 0;
--   SELECT COUNT(*) FROM ratings WHERE stars NOT BETWEEN 1 AND 5;
--   SELECT COUNT(*) FROM requests r LEFT JOIN kits k ON k.id = r.kit_id WHERE r.kit_id IS NOT NULL AND k.id IS NULL;
--   SELECT COUNT(*) FROM credit_ledger l LEFT JOIN requests r ON r.id = l.request_id WHERE l.request_id IS NOT NULL AND r.id IS NULL;
--   SELECT COUNT(*) FROM ratings x LEFT JOIN users u ON u.id = x.rater_id WHERE u.id IS NULL;
--   SELECT COUNT(*) FROM ratings x LEFT JOIN users u ON u.id = x.ratee_id WHERE u.id IS NULL;
--   SELECT COUNT(*) FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.actor_id IS NOT NULL AND u.id IS NULL;
--   SELECT COUNT(*) FROM reports p LEFT JOIN users u ON u.id = p.resolved_by WHERE p.resolved_by IS NOT NULL AND u.id IS NULL;

-- up
ALTER TABLE users ADD CONSTRAINT chk_users_credits CHECK (credits >= 0);

ALTER TABLE requests
  ADD CONSTRAINT chk_requests_dates CHECK (end_date >= start_date),
  ADD CONSTRAINT chk_requests_cost CHECK (credit_cost >= 0),
  ADD CONSTRAINT fk_requests_kit FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE SET NULL;

ALTER TABLE ratings
  ADD CONSTRAINT chk_ratings_stars CHECK (stars BETWEEN 1 AND 5),
  ADD CONSTRAINT fk_ratings_rater FOREIGN KEY (rater_id) REFERENCES users(id),
  ADD CONSTRAINT fk_ratings_ratee FOREIGN KEY (ratee_id) REFERENCES users(id);

ALTER TABLE credit_ledger ADD CONSTRAINT fk_ledger_request FOREIGN KEY (request_id) REFERENCES requests(id);

ALTER TABLE audit_log ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reports ADD CONSTRAINT fk_reports_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id);

-- Indexes for the most frequent queries: the unread count, and "is this item taken on these dates".
ALTER TABLE notifications ADD INDEX idx_notif_user_unread (user_id, read_at);
ALTER TABLE requests ADD INDEX idx_req_item_status (item_id, status, start_date);

-- down
ALTER TABLE requests DROP INDEX idx_req_item_status;
ALTER TABLE notifications DROP INDEX idx_notif_user_unread;
ALTER TABLE reports DROP FOREIGN KEY fk_reports_resolved_by;
ALTER TABLE reports DROP INDEX fk_reports_resolved_by;
ALTER TABLE audit_log DROP FOREIGN KEY fk_audit_actor;
ALTER TABLE audit_log DROP INDEX fk_audit_actor;
ALTER TABLE credit_ledger DROP FOREIGN KEY fk_ledger_request;
ALTER TABLE credit_ledger DROP INDEX fk_ledger_request;
ALTER TABLE ratings DROP FOREIGN KEY fk_ratings_rater, DROP FOREIGN KEY fk_ratings_ratee, DROP CHECK chk_ratings_stars;
ALTER TABLE ratings DROP INDEX fk_ratings_rater, DROP INDEX fk_ratings_ratee;
ALTER TABLE requests DROP FOREIGN KEY fk_requests_kit, DROP CHECK chk_requests_dates, DROP CHECK chk_requests_cost;
ALTER TABLE requests DROP INDEX fk_requests_kit;
ALTER TABLE users DROP CHECK chk_users_credits;
