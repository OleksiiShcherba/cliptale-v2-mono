-- Rollback: 01_create_user_settings
-- Drops the user_settings table. Safe: the row data is per-user preferences only;
-- the app layer falls back to defaults (60 s interval) when no row exists.

DROP TABLE IF EXISTS user_settings;
