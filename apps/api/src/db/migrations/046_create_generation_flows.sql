CREATE TABLE IF NOT EXISTS generation_flows (
  flow_id     CHAR(36)      NOT NULL,
  user_id     CHAR(36)      NOT NULL,
  title       VARCHAR(255)  NOT NULL DEFAULT 'Untitled flow',
  canvas      JSON          NOT NULL,
  version     INT UNSIGNED  NOT NULL DEFAULT 1,
  created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                            ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)   NULL DEFAULT NULL,

  PRIMARY KEY (flow_id),
  -- Serves the only non-PK query: list my active flows newest-first
  -- (Flow 3 / AC-04 / AC-10: WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC).
  -- Leading user_id also satisfies the fk_generation_flows_user FK index requirement.
  INDEX idx_generation_flows_user_active_updated (user_id, deleted_at, updated_at DESC),

  CONSTRAINT fk_generation_flows_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
