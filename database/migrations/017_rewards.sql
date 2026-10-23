-- 017: food rewards for reliable lenders (Hiraman 2.0, batch 33; design spec section 4).
-- Rewards are rice grains and fresh vegetables from local producers, paid for by the LGU (decided 2026-10-24).
--  * suppliers: the local producers (farmers, fisherfolk, gardens, programs) the LGU buys from.
--  * reward_catalog: what a voucher can be exchanged for (for example "2 kg rice"), with the stock on hand.
--  * stock_moves: every change to the stock, so the barangay can account for public money (bought, handed
--    out, back after an expiry, corrected).
--  * vouchers: issued each quarter by Tiwala tier; a 6-digit code collected at the barangay hall.

-- up
CREATE TABLE suppliers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  kind         ENUM('farmer','fisherfolk','garden','program','other') NOT NULL DEFAULT 'farmer',
  contact_name VARCHAR(120) NULL,
  phone        VARCHAR(30) NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE reward_catalog (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name_en        VARCHAR(80) NOT NULL,
  name_fil       VARCHAR(80) NOT NULL,
  supplier_id    INT NULL,
  stock          INT NOT NULL DEFAULT 0,
  value_estimate INT NOT NULL DEFAULT 0,      -- pesos per unit, for the barangay's reports only
  active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_catalog_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE stock_moves (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  catalog_id INT NOT NULL,
  change_qty INT NOT NULL,
  reason     ENUM('purchase','voucher','expiry','cancel','correction') NOT NULL,
  note       VARCHAR(255) NULL,
  by_user    INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_moves_catalog (catalog_id, created_at),
  CONSTRAINT fk_moves_catalog FOREIGN KEY (catalog_id) REFERENCES reward_catalog(id),
  CONSTRAINT fk_moves_user FOREIGN KEY (by_user) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE vouchers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        CHAR(6) NOT NULL UNIQUE,
  user_id     INT NOT NULL,
  period      VARCHAR(10) NOT NULL,
  tier        VARCHAR(10) NOT NULL,
  catalog_id  INT NULL,
  status      ENUM('held','issued','chosen','given','expired','cancelled') NOT NULL,
  hold_reason VARCHAR(255) NULL,
  issued_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_on  DATE NOT NULL,
  released_by INT NULL,
  chosen_at   DATETIME NULL,
  given_at    DATETIME NULL,
  given_by    INT NULL,
  INDEX idx_vouchers_user (user_id, status),
  INDEX idx_vouchers_period (period, status),
  CONSTRAINT fk_vouchers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vouchers_catalog FOREIGN KEY (catalog_id) REFERENCES reward_catalog(id),
  CONSTRAINT fk_vouchers_released FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_vouchers_given FOREIGN KEY (given_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- down
DROP TABLE vouchers;
DROP TABLE stock_moves;
DROP TABLE reward_catalog;
DROP TABLE suppliers;
