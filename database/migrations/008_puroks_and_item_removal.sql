-- 008: puroks managed by staff, and who removed an item.
--  * puroks: the list residents choose from at sign-up. Starts with the seven the app used to offer,
--    plus any purok already saved on an account. People keep their purok if it is later removed.
--  * items.removed_by: 'owner' or 'staff'. Staff can restore only what staff removed.

-- up
CREATE TABLE puroks (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purok_name (name)
) ENGINE=InnoDB;

INSERT INTO puroks (name) VALUES ('Purok 1'), ('Purok 2'), ('Purok 3'), ('Purok 4'), ('Purok 5'), ('Purok 6'), ('Purok 7');
INSERT IGNORE INTO puroks (name) SELECT DISTINCT TRIM(purok) FROM users WHERE purok IS NOT NULL AND TRIM(purok) <> '';

ALTER TABLE items ADD COLUMN removed_by ENUM('owner','staff') NULL AFTER status;

-- down
ALTER TABLE items DROP COLUMN removed_by;
DROP TABLE puroks;
