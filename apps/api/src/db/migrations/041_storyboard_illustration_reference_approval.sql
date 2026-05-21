-- Migration: 041_storyboard_illustration_reference_approval
-- Adds approval gating for the active storyboard principal image.
--
-- Ready canonical references start pending approval. Scene illustration jobs may
-- only start after the active reference is approved.
--
-- Idempotent: INFORMATION_SCHEMA guards + PREPARE/EXECUTE.

SELECT COUNT(*) INTO @_col_reference_approval_status_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_illustration_references'
   AND COLUMN_NAME  = 'approval_status';

SET @_sql_reference_approval_status = IF(
  @_col_reference_approval_status_exists = 0,
  "ALTER TABLE storyboard_illustration_references
     ADD COLUMN approval_status ENUM('pending', 'approved') NOT NULL DEFAULT 'pending'
     AFTER active_lock",
  'SELECT 1 /* approval_status already exists */'
);

PREPARE _stmt FROM @_sql_reference_approval_status;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SELECT COUNT(*) INTO @_col_reference_approved_at_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_illustration_references'
   AND COLUMN_NAME  = 'approved_at';

SET @_sql_reference_approved_at = IF(
  @_col_reference_approved_at_exists = 0,
  'ALTER TABLE storyboard_illustration_references
     ADD COLUMN approved_at DATETIME(3) NULL
     AFTER approval_status',
  'SELECT 1 /* approved_at already exists */'
);

PREPARE _stmt FROM @_sql_reference_approved_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

