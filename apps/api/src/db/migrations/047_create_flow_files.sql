CREATE TABLE IF NOT EXISTS flow_files (
  flow_id     CHAR(36)    NOT NULL,
  file_id     CHAR(36)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3) NULL DEFAULT NULL,

  PRIMARY KEY (flow_id, file_id),
  -- FK index for fk_flow_files_file + reverse lookup "is this asset linked to any flow?"
  -- (the composite PK leads with flow_id and does NOT cover file_id alone).
  INDEX idx_flow_files_file (file_id),

  CONSTRAINT fk_flow_files_flow
    FOREIGN KEY (flow_id) REFERENCES generation_flows(flow_id) ON DELETE CASCADE,
  CONSTRAINT fk_flow_files_file
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
