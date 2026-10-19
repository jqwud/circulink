-- Hiraman database schema (MySQL 8 / MariaDB 10.5+)
-- Run:  mysql -u root -p < database/schema.sql
DROP DATABASE IF EXISTS hiraman;
CREATE DATABASE hiraman CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hiraman;

-- People: residents use the mobile app; lgu_staff / lgu_admin use the web portal.
CREATE TABLE users (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(120) NOT NULL,
  email               VARCHAR(160) NOT NULL UNIQUE,
  phone               VARCHAR(30),
  password_hash       VARCHAR(100) NOT NULL,
  role                ENUM('resident','lgu_staff','lgu_admin') NOT NULL DEFAULT 'resident',
  purok               VARCHAR(60),
  verification_status ENUM('unverified','pending','approved','rejected') NOT NULL DEFAULT 'unverified',
  reject_reason       VARCHAR(255),
  id_photo_path       VARCHAR(255),          -- private: only staff endpoints expose it
  credits             INT NOT NULL DEFAULT 0,
  language            ENUM('en','fil') NOT NULL DEFAULT 'fil',
  suspended           TINYINT(1) NOT NULL DEFAULT 0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE pickup_points (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL,
  note  VARCHAR(255),
  hours VARCHAR(100)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  slug    VARCHAR(40) NOT NULL UNIQUE,
  name_en VARCHAR(80) NOT NULL,
  name_fil VARCHAR(80) NOT NULL,
  icon    VARCHAR(40) NOT NULL DEFAULT 'category'
) ENGINE=InnoDB;

-- owner_id is NULL for Barangay Shelf items (community-owned).
CREATE TABLE items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  owner_id        INT NULL,
  is_shelf        TINYINT(1) NOT NULL DEFAULT 0,
  category_id     INT NOT NULL,
  title           VARCHAR(120) NOT NULL,
  description     TEXT,
  item_condition  ENUM('new','good','fair','worn') NOT NULL DEFAULT 'good',
  tier            ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  pickup_point_id INT NULL,
  photo_url       VARCHAR(255),
  repair_reuse    TINYINT(1) NOT NULL DEFAULT 0,     -- "Repair and Reuse" tag
  status          ENUM('available','paused','removed') NOT NULL DEFAULT 'available',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id),
  INDEX idx_items_status (status), INDEX idx_items_cat (category_id)
) ENGINE=InnoDB;

-- A borrow request and its whole life: pending -> approved -> handed_over -> closed
CREATE TABLE requests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  item_id        INT NOT NULL,
  borrower_id    INT NOT NULL,
  kit_id         INT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         ENUM('pending','approved','rejected','cancelled','handed_over','closed','disputed') NOT NULL DEFAULT 'pending',
  credit_cost    INT NOT NULL DEFAULT 0,
  credits_held   TINYINT(1) NOT NULL DEFAULT 0,       -- 1 while the cost is deducted
  handled_by_staff TINYINT(1) NOT NULL DEFAULT 0,     -- high tier / shelf: handled at the barangay hall
  handover_photo VARCHAR(255),
  handed_over_at DATETIME NULL,
  return_photo   VARCHAR(255),
  returned_at    DATETIME NULL,
  return_condition ENUM('good','damaged','lost') NULL,
  on_time        TINYINT(1) NULL,
  note           VARCHAR(255),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (borrower_id) REFERENCES users(id),
  INDEX idx_req_status (status), INDEX idx_req_item (item_id)
) ENGINE=InnoDB;

-- Every credit change is a row here. Balances are only changed together with a ledger row.
CREATE TABLE credit_ledger (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  request_id INT NULL,
  amount     INT NOT NULL,
  reason     VARCHAR(80) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_ledger_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE wanted_posts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  title       VARCHAR(120) NOT NULL,
  details     VARCHAR(255),
  needed_by   DATE NULL,
  status      ENUM('open','fulfilled','closed') NOT NULL DEFAULT 'open',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE kits (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name_en     VARCHAR(80) NOT NULL,
  name_fil    VARCHAR(80) NOT NULL,
  description VARCHAR(255),
  emoji       VARCHAR(8) DEFAULT '🎁',
  active      TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE kit_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  kit_id      INT NOT NULL,
  category_id INT NOT NULL,
  keyword     VARCHAR(60) NULL,          -- optional title keyword, e.g. 'chair'
  label       VARCHAR(80) NOT NULL,
  FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  type       VARCHAR(40) NOT NULL,
  title      VARCHAR(140) NOT NULL,
  body       VARCHAR(255),
  ref_id     INT NULL,
  read_at    DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_notif_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE announcements (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  author_id  INT NOT NULL,
  audience   VARCHAR(60) NOT NULL DEFAULT 'all',   -- 'all' or a purok name
  title      VARCHAR(140) NOT NULL,
  message    VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Reports from residents; staff mediate them (dispute workflow).
CREATE TABLE reports (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id    INT NOT NULL,
  target_type    ENUM('item','user','request') NOT NULL,
  target_id      INT NOT NULL,
  reason         VARCHAR(80) NOT NULL,
  details        VARCHAR(500),
  status         ENUM('open','in_mediation','resolved') NOT NULL DEFAULT 'open',
  mediator_notes TEXT,
  outcome        VARCHAR(255),
  resolved_by    INT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at    DATETIME NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  INDEX idx_reports_status (status)
) ENGINE=InnoDB;

-- One-question survey at return: "Would you have bought or rented this otherwise?"
CREATE TABLE impact_surveys (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  request_id       INT NOT NULL UNIQUE,
  would_have_bought ENUM('yes','no','maybe') NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id)
) ENGINE=InnoDB;

CREATE TABLE ratings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  rater_id   INT NOT NULL,
  ratee_id   INT NOT NULL,
  stars      TINYINT NOT NULL,
  comment    VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rating (request_id, rater_id),
  FOREIGN KEY (request_id) REFERENCES requests(id)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  actor_id   INT NULL,
  action     VARCHAR(80) NOT NULL,
  target     VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;

-- Reference data
INSERT INTO categories (slug, name_en, name_fil, icon) VALUES
 ('party',   'Party & household', 'Handaan at gamit sa bahay', 'celebration'),
 ('tools',   'Home tools',        'Gamit sa pagkukumpuni',     'build'),
 ('school',  'School & events',   'Gamit sa eskwela at events','school'),
 ('travel',  'Travel & recreation','Biyahe at libangan',       'luggage');

INSERT INTO pickup_points (name, note, hours) VALUES
 ('Barangay Hall',   'Help desk, front counter',     'Mon-Sat 8:00-17:00'),
 ('Covered Court',   'Near the stage, ask the guard','Daily 7:00-20:00'),
 ('Purok 1 Sari-sari Store', 'Partner store, left of the gate', 'Daily 7:00-19:00');

INSERT INTO kits (name_en, name_fil, description, emoji) VALUES
 ('Birthday kit', 'Pang-birthday', 'Chairs, table, speaker and a cooler for a small party', '🎂'),
 ('Exam week kit','Pang-exam',     'Calculator and art or project supplies', '📚'),
 ('Home repair kit','Pang-ayos ng bahay', 'Drill, ladder and a basic hand-tool set', '🛠️');

INSERT INTO kit_items (kit_id, category_id, keyword, label) VALUES
 (1, 1, 'chair',   'Folding chairs'),
 (1, 1, 'table',   'Folding table'),
 (1, 1, 'speaker', 'Speaker'),
 (1, 1, 'cooler',  'Cooler'),
 (2, 3, 'calculator', 'Scientific calculator'),
 (2, 3, 'glue',    'Glue gun or art materials'),
 (3, 2, 'drill',   'Electric drill'),
 (3, 2, 'ladder',  'Ladder'),
 (3, 2, 'screwdriver', 'Screwdriver set');
