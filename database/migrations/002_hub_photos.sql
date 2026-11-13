-- 002: a photo of each hub, so residents see the real school or barangay before they bring items.
-- The photo must be a file uploaded through POST /api/uploads (checked by ownPhoto in server/src/uploads.js).

-- up

ALTER TABLE hubs ADD COLUMN photo_url VARCHAR(255) NULL AFTER hours;

-- down

ALTER TABLE hubs DROP COLUMN photo_url;
