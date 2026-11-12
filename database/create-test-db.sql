-- One-time setup for local development and the automated server tests. Run it once as MySQL root:
--   PowerShell:  mysql -u root -p -e "source database/create-test-db.sql"
--   bash:        mysql -u root -p < database/create-test-db.sql
-- It creates the app account "circulink" (change the password!), the real database and the test database.
-- The tests rebuild circulink_test on every run. They never touch the real "circulink" database.
CREATE USER IF NOT EXISTS 'circulink'@'localhost' IDENTIFIED BY 'change-me-local-password';
CREATE USER IF NOT EXISTS 'circulink'@'127.0.0.1' IDENTIFIED BY 'change-me-local-password';
CREATE DATABASE IF NOT EXISTS circulink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS circulink_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON circulink.* TO 'circulink'@'localhost';
GRANT ALL PRIVILEGES ON circulink.* TO 'circulink'@'127.0.0.1';
GRANT ALL PRIVILEGES ON circulink_test.* TO 'circulink'@'localhost';
GRANT ALL PRIVILEGES ON circulink_test.* TO 'circulink'@'127.0.0.1';
FLUSH PRIVILEGES;
SELECT 'Databases circulink and circulink_test are ready.' AS done;
