-- CircuLink database schema (MySQL 8.0.16+): the starting point for a NEW database.
-- Run:  mysql -u root -p < database/schema.sql      then, in server/:  npm run migrate
-- This file holds the platform tables (accounts, notifications, audit, jobs). The drop-off hub tables come
-- from database/migrations. Never edit this file to change an existing database: add a numbered migration.
DROP DATABASE IF EXISTS circulink;
CREATE DATABASE circulink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE circulink;

-- People. Residents use the mobile app; staff, partner organizations and admins use the web portal.
-- One account per email, per phone number and per student ID (rule R8).
CREATE TABLE users (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(120) NOT NULL,
  email                 VARCHAR(160) NOT NULL UNIQUE,
  phone                 VARCHAR(30) NULL UNIQUE,
  student_id            VARCHAR(40) NULL UNIQUE,
  password_hash         VARCHAR(100) NOT NULL,
  role                  ENUM('resident','staff','partner','admin') NOT NULL DEFAULT 'resident',
  language              ENUM('en','fil') NOT NULL DEFAULT 'en',
  suspended             TINYINT(1) NOT NULL DEFAULT 0,
  token_version         INT NOT NULL DEFAULT 0,
  must_change_password  TINYINT(1) NOT NULL DEFAULT 0,
  privacy_version       VARCHAR(20) NULL,
  privacy_accepted_at   DATETIME NULL,
  deletion_requested_at DATETIME NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- What the apps show in the bell list. `params` lets the app write the sentence in the person's language.
CREATE TABLE notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  type       VARCHAR(40) NOT NULL,
  title      VARCHAR(140) NOT NULL,
  body       VARCHAR(255),
  params     JSON NULL,
  ref_id     INT NULL,
  read_at    DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id)
) ENGINE=InnoDB;

-- Append-only record of every change (rule R12). The code only ever INSERTs here; a test checks that.
CREATE TABLE audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id   INT NULL,
  action     VARCHAR(80) NOT NULL,
  entity     VARCHAR(40) NULL,
  entity_id  INT NULL,
  details    JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_time (created_at),
  INDEX idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB;

-- When each scheduled job last ran and how it went (src/jobs.js).
CREATE TABLE job_runs (
  name        VARCHAR(60) PRIMARY KEY,
  last_run_at DATETIME NULL,
  last_ok_at  DATETIME NULL,
  last_result VARCHAR(255) NULL,
  last_error  VARCHAR(255) NULL
) ENGINE=InnoDB;
