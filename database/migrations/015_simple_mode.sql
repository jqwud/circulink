-- 015: Simple mode for seniors and PWDs (Hiraman 2.0, batch 30): larger text, four big buttons on Home,
-- no swiping, calm transitions. Kept on the account so it follows the person to any phone, and so barangay
-- staff can switch it on for them (for example at verification).

-- up
ALTER TABLE users ADD COLUMN simple_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER thanks_opt_in;

-- down
ALTER TABLE users DROP COLUMN simple_mode;
