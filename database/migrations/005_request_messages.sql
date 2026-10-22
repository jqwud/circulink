-- 005: a short message thread on every request, for the borrower, the owner and barangay staff.
-- Messages are personal data: they are included in "My data" and removed with the account.

-- up
CREATE TABLE request_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  sender_id  INT NOT NULL,
  body       VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_request (request_id, id),
  CONSTRAINT fk_msg_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- down
DROP TABLE request_messages;
