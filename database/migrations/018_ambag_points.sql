-- 018: Ambag points, LGU reward campaigns and points redemption (batch 35).
--  * credit_ledger keeps every credit change and now holds two accounts: 'borrow' (the existing credits,
--    unchanged) and 'reward' (Ambag points). Existing rows become 'borrow' through the column default, so
--    their meaning and every balance stay exactly as they were. New columns say where each change came from
--    (source, campaign, actor, note), and award_key (UNIQUE) makes a second award for the same event impossible.
--    expires_on / remaining track each earned lot of points for the 12-month expiry; spending takes the oldest
--    lots first (points_allocations records which lots paid for what, so a refund puts them back).
--  * users.reward_points is the cached Ambag balance, updated in the same transaction as the ledger row.
--  * reward_campaigns / campaign_rules: LGU programs and how many points each verified activity earns.
--    The always-on "Base Program" holds the default rules. campaign_activities: activities staff record.
--  * points_adjustments: admin corrections with a reason; big ones need a second admin.
--  * reward_catalog: description, photo, points price, availability dates, approval and per-resident limit.
--    for_tier = 1 keeps an item choosable for the quarterly Tiwala vouchers (all existing items).
--  * vouchers: source 'tier' (the quarterly Tiwala vouchers, unchanged) or 'points' (a redemption), plus the
--    states requested / approved / rejected for redemptions that need staff approval.
--  * wanted_posts: the loan or donation that fulfilled a post, so a helper's points are verifiable.

-- up
ALTER TABLE credit_ledger
  ADD COLUMN account ENUM('borrow','reward') NOT NULL DEFAULT 'borrow' AFTER user_id,
  ADD COLUMN source_type VARCHAR(30) NULL AFTER reason,
  ADD COLUMN source_id INT NULL AFTER source_type,
  ADD COLUMN campaign_id INT NULL AFTER source_id,
  ADD COLUMN reversal_of INT NULL AFTER campaign_id,
  ADD COLUMN actor_id INT NULL AFTER reversal_of,
  ADD COLUMN note VARCHAR(255) NULL AFTER actor_id,
  ADD COLUMN expires_on DATE NULL AFTER note,
  ADD COLUMN remaining INT NULL AFTER expires_on,
  ADD COLUMN award_key VARCHAR(80) NULL AFTER remaining,
  ADD UNIQUE KEY uq_ledger_award (award_key),
  ADD INDEX idx_ledger_account (user_id, account, id),
  ADD INDEX idx_ledger_source (source_type, source_id),
  ADD INDEX idx_ledger_lots (account, expires_on);
ALTER TABLE users ADD COLUMN reward_points INT NOT NULL DEFAULT 0 AFTER credits;

CREATE TABLE points_allocations (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  spend_id  INT NOT NULL,
  lot_id    INT NOT NULL,
  amount    INT NOT NULL,
  INDEX idx_alloc_spend (spend_id),
  CONSTRAINT fk_alloc_spend FOREIGN KEY (spend_id) REFERENCES credit_ledger(id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_lot FOREIGN KEY (lot_id) REFERENCES credit_ledger(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reward_campaigns (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name_en          VARCHAR(120) NOT NULL,
  name_fil         VARCHAR(120) NOT NULL,
  objective_en     VARCHAR(1000) NULL,
  objective_fil    VARCHAR(1000) NULL,
  starts_on        DATE NULL,
  ends_on          DATE NULL,
  status           ENUM('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
  is_base          TINYINT(1) NOT NULL DEFAULT 0,
  resident_cap     INT NULL,
  total_cap        INT NULL,
  min_account_days INT NOT NULL DEFAULT 0,
  puroks           JSON NULL,
  announced_at     DATETIME NULL,
  created_by       INT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_campaign_status (status),
  CONSTRAINT fk_campaign_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE campaign_rules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  activity    ENUM('loan_lender','loan_borrower','donation_donor','wanted_helper','community') NOT NULL,
  points      INT NOT NULL,
  UNIQUE KEY uq_rule (campaign_id, activity),
  CONSTRAINT fk_rule_campaign FOREIGN KEY (campaign_id) REFERENCES reward_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE campaign_activities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  user_id     INT NOT NULL,
  note        VARCHAR(255) NOT NULL,
  recorded_by INT NULL,
  points      INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_campaign (campaign_id),
  CONSTRAINT fk_activity_campaign FOREIGN KEY (campaign_id) REFERENCES reward_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE points_adjustments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  amount       INT NOT NULL,
  reason       VARCHAR(255) NOT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_by INT NULL,
  decided_by   INT NULL,
  ledger_id    INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at   DATETIME NULL,
  INDEX idx_adjust_status (status),
  CONSTRAINT fk_adjust_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_adjust_req FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_adjust_dec FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO reward_campaigns (name_en, name_fil, objective_en, objective_fil, status, is_base)
VALUES ('Base Program', 'Batayang Programa',
        'Ambag points for verified sharing: good, on-time loans and returns, completed donations, and wanted posts fulfilled.',
        'Ambag points para sa beripikadong pagbabahagi: maayos at nasa oras na pahiram at pagsauli, natapos na donasyon, at natupad na hiling.',
        'active', 1);
INSERT INTO campaign_rules (campaign_id, activity, points)
SELECT id, a.activity, a.points FROM reward_campaigns
  JOIN (SELECT 'loan_lender' AS activity, 10 AS points UNION ALL SELECT 'loan_borrower', 3
        UNION ALL SELECT 'donation_donor', 15 UNION ALL SELECT 'wanted_helper', 10) a
 WHERE is_base = 1;

ALTER TABLE reward_catalog
  ADD COLUMN description_en  VARCHAR(500) NULL AFTER name_fil,
  ADD COLUMN description_fil VARCHAR(500) NULL AFTER description_en,
  ADD COLUMN photo_url       VARCHAR(255) NULL AFTER description_fil,
  ADD COLUMN for_tier        TINYINT(1) NOT NULL DEFAULT 1 AFTER active,
  ADD COLUMN points_cost     INT NULL AFTER for_tier,
  ADD COLUMN available_from  DATE NULL AFTER points_cost,
  ADD COLUMN available_until DATE NULL AFTER available_from,
  ADD COLUMN needs_approval  TINYINT(1) NOT NULL DEFAULT 0 AFTER available_until,
  ADD COLUMN per_resident_limit INT NULL AFTER needs_approval;

ALTER TABLE vouchers
  ADD COLUMN source ENUM('tier','points') NOT NULL DEFAULT 'tier' AFTER user_id,
  MODIFY COLUMN status ENUM('held','issued','chosen','given','expired','cancelled','requested','approved','rejected') NOT NULL,
  ADD COLUMN points_spent INT NULL AFTER catalog_id,
  ADD COLUMN ledger_id INT NULL AFTER points_spent,
  ADD COLUMN redeem_key VARCHAR(60) NULL AFTER ledger_id,
  ADD COLUMN decided_by INT NULL AFTER given_by,
  ADD COLUMN decided_at DATETIME NULL AFTER decided_by,
  ADD COLUMN reject_reason VARCHAR(255) NULL AFTER decided_at,
  ADD UNIQUE KEY uq_vouchers_redeem (redeem_key),
  ADD INDEX idx_vouchers_source (source, status),
  ADD CONSTRAINT fk_vouchers_decided FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE wanted_posts
  ADD COLUMN fulfilled_request_id INT NULL,
  ADD COLUMN fulfilled_claim_id INT NULL,
  ADD UNIQUE KEY uq_wanted_request (fulfilled_request_id),
  ADD UNIQUE KEY uq_wanted_claim (fulfilled_claim_id);

-- down
ALTER TABLE wanted_posts DROP INDEX uq_wanted_claim, DROP INDEX uq_wanted_request, DROP COLUMN fulfilled_claim_id, DROP COLUMN fulfilled_request_id;
DELETE FROM vouchers WHERE source = 'points';
ALTER TABLE vouchers DROP FOREIGN KEY fk_vouchers_decided, DROP INDEX idx_vouchers_source, DROP INDEX uq_vouchers_redeem,
  DROP COLUMN reject_reason, DROP COLUMN decided_at, DROP COLUMN decided_by, DROP COLUMN redeem_key, DROP COLUMN ledger_id, DROP COLUMN points_spent,
  MODIFY COLUMN status ENUM('held','issued','chosen','given','expired','cancelled') NOT NULL, DROP COLUMN source;
ALTER TABLE reward_catalog DROP COLUMN per_resident_limit, DROP COLUMN needs_approval, DROP COLUMN available_until, DROP COLUMN available_from,
  DROP COLUMN points_cost, DROP COLUMN for_tier, DROP COLUMN photo_url, DROP COLUMN description_fil, DROP COLUMN description_en;
DROP TABLE points_adjustments;
DROP TABLE campaign_activities;
DROP TABLE campaign_rules;
DROP TABLE reward_campaigns;
DROP TABLE points_allocations;
ALTER TABLE users DROP COLUMN reward_points;
DELETE FROM credit_ledger WHERE account = 'reward';
ALTER TABLE credit_ledger DROP INDEX idx_ledger_lots, DROP INDEX idx_ledger_source, DROP INDEX idx_ledger_account, DROP INDEX uq_ledger_award,
  DROP COLUMN award_key, DROP COLUMN remaining, DROP COLUMN expires_on, DROP COLUMN note, DROP COLUMN actor_id, DROP COLUMN reversal_of,
  DROP COLUMN campaign_id, DROP COLUMN source_id, DROP COLUMN source_type, DROP COLUMN account;
