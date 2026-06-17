---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0009 — Attach code-backed graphics to storyboard blocks via a separate snapshot table

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Context

The existing `storyboard_block_media` pivot (migration 033) attaches media to a block via a `file_id` FK to `files` and a `media_type` ENUM (`image`/`video`/`audio`). A Motion Graphic instance is a frozen snapshot of code + duration at insertion (CONTEXT: Instance, Snapshot) — it is not a file. We must decide how a code-backed snapshot attaches to a block (AC-04, AC-10).

## Decision drivers

- A placed instance is an immutable snapshot of code + duration, frozen at insertion and never altered by later source edits (AC-10) — distinct lifecycle from a file.
- The existing block-media pivot keys on `file_id` (FK to `files`); a motion graphic has no file row.
- Forward-compat for version-pinning (MVP3) — the snapshot is the pin point (CONTEXT: Snapshot).

## Considered options

1. **Separate snapshot table** — a new `motion_graphic_block_snapshot` table (code, duration, fps, dimensions, source-graphic id) that `storyboard_block_media` references via `media_type = 'motion_graphic'`; `file_id` stays null for that kind.
2. **Nullable snapshot columns on the pivot** — add `snapshot_code` / `snapshot_duration` (nullable) directly on `storyboard_block_media`; `file_id` null for motion graphics.

## Decision outcome

**Chosen:** Option 1 (separate snapshot table). It keeps the immutable code snapshot in its own table with a clean lifecycle, avoids making `storyboard_block_media` a polymorphic row whose columns are half-null per kind, and gives version-pinning (MVP3) a natural home. The pivot gains only the new `motion_graphic` ENUM value and a nullable reference; `file_id` remains the file path for the existing kinds. Exact columns/indexes are `data-model`'s job.

## Consequences

**Positive**
- The frozen snapshot (AC-10) lives in a dedicated, immutable-by-convention table — clean isolation from live `files` media.
- The pivot stays close to its current shape (one new ENUM value + a nullable FK), minimal disruption to existing block-media reads.

**Negative**
- One extra join to resolve a block's motion-graphic media; a second table to migrate (058+).
- The existing pivot column `storyboard_block_media.file_id` is `CHAR(36) NOT NULL` with a `NOT NULL` FK to `files` (migration 033); supporting a `motion_graphic` row with no file requires the 058+ migration to make `file_id` **nullable** and relax/replace that FK constraint (the snapshot reference is non-null instead). Exact column/constraint changes are `data-model`'s job.

**Neutral**
- Version-pinning (MVP3) extends this table additively; no rewrite of the MVP1 shape.

## Links

- Spec: [[../spec.md]] §5 (AC-04, AC-10)
- SAD: [[../sad.md]] §5, §8
- Related ADR: [[0008-single-store-mysql-code-as-text]]
