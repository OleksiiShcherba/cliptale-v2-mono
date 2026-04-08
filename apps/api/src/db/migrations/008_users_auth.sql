-- Migration: 008_users_auth
-- Creates auth-related tables: users, sessions, password_resets, email_verifications.
-- Supports email/password registration, OAuth (Google/GitHub), session-based auth,
-- password reset, and email verification flows.
-- Idempotent: safe to run multiple times.

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id         CHAR(36)        NOT NULL,
  email           VARCHAR(255)    NOT NULL,
  display_name    VARCHAR(255)    NOT NULL,
  password_hash   VARCHAR(255)    NULL,
  google_id       VARCHAR(255)    NULL,
  github_id       VARCHAR(255)    NULL,
  email_verified  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                  ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (user_id),
  UNIQUE INDEX idx_users_email (email),
  INDEX idx_users_google_id (google_id),
  INDEX idx_users_github_id (github_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  session_id      CHAR(36)        NOT NULL,
  user_id         CHAR(36)        NOT NULL,
  token_hash      CHAR(64)        NOT NULL,
  expires_at      DATETIME(3)     NOT NULL,
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (session_id),
  UNIQUE INDEX idx_sessions_token_hash (token_hash),
  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ── Password Resets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  reset_id        CHAR(36)        NOT NULL,
  user_id         CHAR(36)        NOT NULL,
  token_hash      CHAR(64)        NOT NULL,
  expires_at      DATETIME(3)     NOT NULL,
  used_at         DATETIME(3)     NULL,
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (reset_id),
  UNIQUE INDEX idx_password_resets_token_hash (token_hash),
  INDEX idx_password_resets_user_id (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ── Email Verifications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  verification_id CHAR(36)        NOT NULL,
  user_id         CHAR(36)        NOT NULL,
  token_hash      CHAR(64)        NOT NULL,
  expires_at      DATETIME(3)     NOT NULL,
  used_at         DATETIME(3)     NULL,
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (verification_id),
  UNIQUE INDEX idx_email_verifications_token_hash (token_hash),
  INDEX idx_email_verifications_user_id (user_id),
  CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
