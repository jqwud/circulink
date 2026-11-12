-- 001: the drop-off hub system (docs/CIRCULAR_HUB_SPEC.md, section 6).
-- Hubs and who works there, partner organizations, recyclers, categories, declarations and items,
-- releases to partners, recycle batches, the points ledger and review flags.

-- up

CREATE TABLE hubs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  type       ENUM('school','barangay','other') NOT NULL,
  address    VARCHAR(255) NOT NULL,
  hours      VARCHAR(120) NULL,
  status     ENUM('active','paused','closed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Staff act only at the hubs they are assigned to (rule R4).
CREATE TABLE hub_staff (
  hub_id  INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (hub_id, user_id),
  FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Only approved partner organizations receive items (rule R2).
CREATE TABLE partners (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL UNIQUE,
  org_name    VARCHAR(160) NOT NULL,
  kind        ENUM('shelter','school','ngo','other') NOT NULL,
  status      ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending',
  approved_by INT NULL,
  approved_at DATETIME NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Hazardous items go only to accredited recyclers (rule R10).
CREATE TABLE recyclers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(160) NOT NULL,
  materials  VARCHAR(255) NOT NULL,
  accredited TINYINT(1) NOT NULL DEFAULT 0,
  status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Rates and CO2 factors are estimates an admin can change. Changes are audited.
CREATE TABLE categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(40) NOT NULL UNIQUE,
  name_en     VARCHAR(80) NOT NULL,
  name_fil    VARCHAR(80) NOT NULL,
  rate_per_kg DECIMAL(6,2) NOT NULL,
  co2_per_kg  DECIMAL(6,2) NOT NULL,
  hazardous   TINYINT(1) NOT NULL DEFAULT 0,
  food        TINYINT(1) NOT NULL DEFAULT 0,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT chk_cat_rate CHECK (rate_per_kg >= 0),
  CONSTRAINT chk_cat_co2 CHECK (co2_per_kg >= 0)
) ENGINE=InnoDB;

-- A resident's promise to bring items to a hub. The code works once and expires (rule R9).
CREATE TABLE declarations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  resident_id INT NOT NULL,
  hub_id      INT NOT NULL,
  code        CHAR(6) NOT NULL UNIQUE,
  note        VARCHAR(255) NULL,
  status      ENUM('open','received','expired','cancelled') NOT NULL DEFAULT 'open',
  expires_at  DATETIME NOT NULL,
  received_at DATETIME NULL,
  received_by INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resident_id) REFERENCES users(id),
  FOREIGN KEY (hub_id) REFERENCES hubs(id),
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_decl_resident (resident_id, status)
) ENGINE=InnoDB;

-- One physical item (or one bag of the same material). Weighed and sorted by staff at the hub.
CREATE TABLE items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  declaration_id INT NOT NULL,
  category_id    INT NOT NULL,
  description    VARCHAR(160) NULL,
  weight_kg      DECIMAL(7,2) NULL,
  outcome        ENUM('reuse','repair','recycle','reject') NULL,
  state          ENUM('declared','received','in_stock','in_repair','in_recycle_batch','rejected','released','recycled')
                 NOT NULL DEFAULT 'declared',
  expiry_date    DATE NULL,
  photo_url      VARCHAR(255) NULL,
  processed_by   INT NULL,
  processed_at   DATETIME NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_item_weight CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg <= 500)),
  INDEX idx_items_state (state)
) ENGINE=InnoDB;

-- Reusable stock going out to a partner organization.
CREATE TABLE releases (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  partner_id   INT NOT NULL,
  hub_id       INT NOT NULL,
  note         VARCHAR(255) NULL,
  status       ENUM('requested','released','picked_up','cancelled') NOT NULL DEFAULT 'requested',
  released_by  INT NULL,
  released_at  DATETIME NULL,
  picked_up_at DATETIME NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (hub_id) REFERENCES hubs(id),
  FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE release_items (
  release_id INT NOT NULL,
  item_id    INT NOT NULL UNIQUE,
  PRIMARY KEY (release_id, item_id),
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;

-- Recyclable items leaving a hub together for one recycler.
CREATE TABLE recycle_batches (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  hub_id      INT NOT NULL,
  recycler_id INT NOT NULL,
  total_kg    DECIMAL(9,2) NOT NULL DEFAULT 0,
  status      ENUM('open','sent') NOT NULL DEFAULT 'open',
  sent_at     DATETIME NULL,
  sent_by     INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hub_id) REFERENCES hubs(id),
  FOREIGN KEY (recycler_id) REFERENCES recyclers(id),
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE recycle_batch_items (
  batch_id INT NOT NULL,
  item_id  INT NOT NULL UNIQUE,
  PRIMARY KEY (batch_id, item_id),
  FOREIGN KEY (batch_id) REFERENCES recycle_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;

-- Points exist only as rows here (rule R12). One row per item: pending until the item is final (rule R6).
CREATE TABLE points_ledger (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  item_id    INT NOT NULL UNIQUE,
  points     INT NOT NULL,
  status     ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  reason     VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT chk_points_nonneg CHECK (points >= 0),
  INDEX idx_points_user (user_id, status)
) ENGINE=InnoDB;

-- Things an admin must look at (rule R7). Flagged points stay pending until the flag is cleared.
CREATE TABLE flags (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  kind        VARCHAR(40) NOT NULL,
  entity      VARCHAR(40) NOT NULL,
  entity_id   INT NOT NULL,
  detail      VARCHAR(255) NULL,
  status      ENUM('open','cleared','upheld') NOT NULL DEFAULT 'open',
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_flags_open (status, kind)
) ENGINE=InnoDB;

-- Starting categories. Points per kg and kg CO2e avoided per kg are rough estimates; admins can change them.
INSERT INTO categories (slug, name_en, name_fil, rate_per_kg, co2_per_kg, hazardous, food) VALUES
 ('clothes',     'Clothes and textiles',     'Damit at tela',             10, 15.0, 0, 0),
 ('shoes_bags',  'Shoes and bags',           'Sapatos at bag',             8, 10.0, 0, 0),
 ('books',       'Books and paper',          'Libro at papel',             4,  1.0, 0, 0),
 ('school',      'School supplies',          'Gamit sa eskwela',           6,  2.0, 0, 0),
 ('kitchen',     'Kitchenware',              'Gamit sa kusina',            6,  3.0, 0, 0),
 ('toys',        'Toys',                     'Laruan',                     6,  3.0, 0, 0),
 ('furniture',   'Small furniture',          'Maliit na muwebles',         3,  1.5, 0, 0),
 ('appliances',  'Small appliances',         'Maliit na appliance',       10,  6.0, 0, 0),
 ('ewaste',      'E-waste (phones, cables)', 'E-waste (cellphone, kable)', 15, 20.0, 1, 0),
 ('batteries',   'Batteries',                'Baterya',                   12,  5.0, 1, 0),
 ('plastic',     'Plastic bottles',          'Bote ng plastik',            5,  1.5, 0, 0),
 ('cans',        'Metal cans',               'Lata',                       5,  4.0, 0, 0),
 ('glass',       'Glass bottles',            'Bote ng salamin',            2,  0.3, 0, 0),
 ('food',        'Sealed packaged food',     'Selyadong pagkain',          8,  2.5, 0, 1);

-- down

DROP TABLE IF EXISTS flags;
DROP TABLE IF EXISTS points_ledger;
DROP TABLE IF EXISTS recycle_batch_items;
DROP TABLE IF EXISTS recycle_batches;
DROP TABLE IF EXISTS release_items;
DROP TABLE IF EXISTS releases;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS declarations;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS recyclers;
DROP TABLE IF EXISTS partners;
DROP TABLE IF EXISTS hub_staff;
DROP TABLE IF EXISTS hubs;
