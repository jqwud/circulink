-- One-time setup for local development and the automated server tests. Run it once as MySQL root, giving
-- the password for the app account on the command line (it is never saved in this file, which is public):
--   mysql -u root -p -e "SET @pw = 'your-password'; source database/create-test-db.sql"
-- It creates the app account "circulink", the real database and the test database. Put the same password
-- in server/.env (DB_USER=circulink, DB_PASSWORD=...). Running it again is safe; it also resets the password.
-- The tests rebuild circulink_test on every run. They never touch the real "circulink" database.
SET @pw = IFNULL(@pw, '');
SELECT IF(@pw = '', 'Stopping: run it as  SET @pw = ''your-password''; source database/create-test-db.sql', 'Creating...') AS step;

SET @sql = IF(@pw = '', 'DO 0', CONCAT("CREATE USER IF NOT EXISTS 'circulink'@'localhost' IDENTIFIED BY ", QUOTE(@pw)));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(@pw = '', 'DO 0', CONCAT("CREATE USER IF NOT EXISTS 'circulink'@'127.0.0.1' IDENTIFIED BY ", QUOTE(@pw)));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(@pw = '', 'DO 0', CONCAT("ALTER USER 'circulink'@'localhost' IDENTIFIED BY ", QUOTE(@pw)));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(@pw = '', 'DO 0', CONCAT("ALTER USER 'circulink'@'127.0.0.1' IDENTIFIED BY ", QUOTE(@pw)));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE DATABASE IF NOT EXISTS circulink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS circulink_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @sql = IF(@pw = '', 'DO 0', "GRANT ALL PRIVILEGES ON circulink.* TO 'circulink'@'localhost', 'circulink'@'127.0.0.1'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(@pw = '', 'DO 0', "GRANT ALL PRIVILEGES ON circulink_test.* TO 'circulink'@'localhost', 'circulink'@'127.0.0.1'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
FLUSH PRIVILEGES;
SELECT IF(@pw = '', 'Nothing was created: no password given.', 'Account circulink and databases circulink and circulink_test are ready.') AS done;
