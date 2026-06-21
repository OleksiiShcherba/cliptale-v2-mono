-- Migration: 065_backfill_reference_scene_links
--
-- One-time backfill: for every storyboard_reference_block that currently has
-- zero entries in storyboard_reference_scene_links, derive the missing links
-- from the draft's latest completed storyboard_cast_extraction_jobs proposal.
--
-- ROOT CAUSE this fixes: reference blocks were created via the legacy
-- POST /references/confirm route, which inserted links from the client-body
-- `entry.sceneBlockIds` array. When the front-end omitted that field (or the
-- flow predated auto-link), zero link rows were inserted. The LLM proposal
-- stored in proposal_json already holds the authoritative scene_block_ids per
-- cast entry, so we can re-derive the links from it.
--
-- Matching strategy:
--   proposal entry ($.cast[*].type, $.cast[*].name)
--     ↔ storyboard_reference_blocks (cast_type, name)
-- This is the same pairing used by storyboardPipeline.confirm.service.ts:338-345.
--
-- Safety guards:
--   1. INSERT IGNORE — composite PK (reference_block_id, scene_block_id) prevents
--      duplicate rows. If the process crashes after the INSERT but before
--      schema_migrations is updated, re-running is a clean no-op.
--   2. NOT EXISTS filter — limits the INSERT to blocks with zero links, so
--      blocks that already have correct links are never touched.
--   3. JOIN storyboard_blocks — only existing scene ids are inserted; no FK
--      violations can occur.
--   4. Duplicate-name guard — if two proposal entries share the same
--      (cast_type, name) within a draft, the match is ambiguous; we skip the
--      block rather than risk mis-linking.
--   5. Latest-job filter — uses only the most-recently completed extraction job
--      per draft (ORDER BY created_at DESC LIMIT 1 correlated sub-select),
--      so stale or partial jobs don't pollute the backfill.
--
-- Idempotent: combining INSERT IGNORE with the NOT EXISTS predicate means a
-- second execution of this SQL inserts nothing for blocks that already have
-- links (including every block written by the first run).
--
-- Manual rollback (removes ONLY the backfilled rows — blocks that had links
-- before this migration are unaffected because they were excluded by NOT EXISTS):
--   DELETE srsl
--   FROM storyboard_reference_scene_links srsl
--   WHERE NOT EXISTS (
--     SELECT 1 FROM storyboard_reference_scene_links r2
--     WHERE r2.reference_block_id = srsl.reference_block_id
--     AND r2.created_at < '<timestamp of migration run>'
--   );
-- (Practical: the safest rollback is to restore a DB snapshot taken before the
-- migration, or to delete specific link rows identified by reference_block_id.)

INSERT IGNORE INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
SELECT DISTINCT
  srb.id              AS reference_block_id,
  jt_scene.scene_block_id

FROM storyboard_reference_blocks srb

-- Only the latest completed extraction job for this draft
JOIN storyboard_cast_extraction_jobs cej
  ON  cej.draft_id = srb.draft_id
  AND cej.status   = 'completed'
  AND cej.id = (
    SELECT id
    FROM storyboard_cast_extraction_jobs
    WHERE draft_id = srb.draft_id
      AND status   = 'completed'
    ORDER BY created_at DESC
    LIMIT 1
  )

-- Expand the cast array to rows: (cast_type, name, scene_block_ids JSON)
JOIN JSON_TABLE(
  cej.proposal_json,
  '$.cast[*]' COLUMNS (
    cast_name       VARCHAR(255) PATH '$.name',
    cast_type       VARCHAR(50)  PATH '$.type',
    scene_block_ids JSON         PATH '$.scene_block_ids'
  )
) jt_entry
  ON  jt_entry.cast_type = srb.cast_type
  AND jt_entry.cast_name = srb.name

-- Expand each entry's scene_block_ids array to individual scene id rows
JOIN JSON_TABLE(
  jt_entry.scene_block_ids,
  '$[*]' COLUMNS (
    scene_block_id CHAR(36) PATH '$'
  )
) jt_scene ON TRUE

-- FK guard: only insert scene ids that exist in storyboard_blocks
JOIN storyboard_blocks sb
  ON sb.id = jt_scene.scene_block_id

-- Only backfill blocks that currently have ZERO links (safety: don't touch
-- blocks that already have correct associations)
WHERE NOT EXISTS (
  SELECT 1
  FROM storyboard_reference_scene_links
  WHERE reference_block_id = srb.id
)

-- Ambiguity guard: skip if two proposal entries share the same (type, name)
-- within this draft — ambiguous match is worse than no match
AND (
  SELECT COUNT(*)
  FROM JSON_TABLE(
    cej.proposal_json,
    '$.cast[*]' COLUMNS (
      cast_name2 VARCHAR(255) PATH '$.name',
      cast_type2 VARCHAR(50)  PATH '$.type'
    )
  ) dupe
  WHERE dupe.cast_type2 = srb.cast_type
    AND dupe.cast_name2 = srb.name
) = 1;
