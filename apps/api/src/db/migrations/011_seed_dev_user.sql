-- Migration: 011_seed_dev_user
-- Seeds the dev-bypass user so that APP_DEV_AUTH_BYPASS=true works with FK constraints
-- (ai_provider_configs, ai_generation_jobs reference users.user_id).
INSERT IGNORE INTO users (user_id, email, display_name, password_hash, email_verified)
VALUES ('dev-user-001', 'dev@cliptale.local', 'Dev User', NULL, 1);
