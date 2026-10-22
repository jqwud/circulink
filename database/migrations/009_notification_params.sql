-- 009: notifications in the reader's language.
--  * params: the values of a notification (item, dates, names, numbers) as JSON. The app writes the sentence
--    in Filipino or English from the type and these values. title and body stay as the English fallback
--    for older rows and older app versions.

-- up
ALTER TABLE notifications ADD COLUMN params JSON NULL AFTER body;

-- down
ALTER TABLE notifications DROP COLUMN params;
