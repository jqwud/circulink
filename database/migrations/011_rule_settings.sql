-- 011: rule numbers an admin changed in the portal. Only changed numbers are stored; everything else keeps
-- the default in server/src/rules.js. Deleting a row goes back to the default.

-- up
CREATE TABLE rule_settings (
  name       VARCHAR(60) PRIMARY KEY,
  value      INT NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rule_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- down
DROP TABLE rule_settings;
