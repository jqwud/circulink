-- 003: certificates that recognise residents who keep things in use (docs/CERTIFICATES.md).
-- Each hub names its head (the school principal or the punong barangay), who signs certificates with the
-- CircuLink programme lead. One certificate per level per resident; anyone can check one by its code.

-- up

ALTER TABLE hubs
  ADD COLUMN head_name  VARCHAR(120) NULL AFTER photo_url,
  ADD COLUMN head_title VARCHAR(120) NULL AFTER head_name;

CREATE TABLE certificates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(16) NOT NULL UNIQUE,
  user_id       INT NOT NULL,
  level         ENUM('participation','recognition','champion') NOT NULL,
  status        ENUM('pending','issued','declined','revoked') NOT NULL,
  hub_id        INT NULL,
  kg_kept       DECIMAL(10,2) NOT NULL DEFAULT 0,
  points        INT NOT NULL DEFAULT 0,
  dropoffs      INT NOT NULL DEFAULT 0,
  months_active INT NOT NULL DEFAULT 0,
  requested_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  issued_at     DATETIME NULL,
  decided_by    INT NULL,
  decided_at    DATETIME NULL,
  reason        VARCHAR(255) NULL,
  UNIQUE KEY uq_cert_user_level (user_id, level),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE SET NULL,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- down

DROP TABLE certificates;
ALTER TABLE hubs DROP COLUMN head_title, DROP COLUMN head_name;
