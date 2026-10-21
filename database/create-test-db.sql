-- One-time setup for the automated server tests. Run it once as MySQL root:
--   PowerShell:  mysql -u root -p -e "source database/create-test-db.sql"
--   bash:        mysql -u root -p < database/create-test-db.sql
-- The tests then rebuild this database on every run. They never touch the real "hiraman" database.
-- If your app account is not called "hiraman", change the user names below.
CREATE DATABASE IF NOT EXISTS hiraman_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON hiraman_test.* TO 'hiraman'@'localhost';
GRANT ALL PRIVILEGES ON hiraman_test.* TO 'hiraman'@'127.0.0.1';
FLUSH PRIVILEGES;
SELECT 'Test database hiraman_test is ready.' AS done;
