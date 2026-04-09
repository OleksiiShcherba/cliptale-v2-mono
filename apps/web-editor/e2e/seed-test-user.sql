-- Idempotent seed for the E2E test user.
-- Password: TestPassword123!
-- bcrypt hash (cost 12): $2b$12$GuXOwe8lXVRPMdbx3HoKruoeoP1c2FFZytwnpWTkUYUCIUOO6NTLG
INSERT IGNORE INTO users (user_id, email, display_name, password_hash, email_verified)
VALUES ('e2e-test-user-001', 'e2e@cliptale.test', 'E2E Test User',
        '$2b$12$GuXOwe8lXVRPMdbx3HoKruoeoP1c2FFZytwnpWTkUYUCIUOO6NTLG', 1);
