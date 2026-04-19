---
name: Project: Files-as-root Batch 2 progress
description: Files-as-root BATCH 2 (7 subtasks); ALL 7 subtasks COMPLETE (2026-04-18)
type: project
---

Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression.

**Why:** Port editor's upload + AI generation flows to the storyboard (wizard) page by extracting shared hooks/components and adding a draft-scoped AI generation endpoint.

**Status: ALL COMPLETE (2026-04-18)**

Subtasks 1–6 COMPLETE — see prior entries. Subtask 7 (Playwright E2E) COMPLETE — see below.

**Subtask 7** — COMPLETE (2026-04-18)

E2E regression sweep ran all 5 workflows PASS:
- WF-A: Home Hub scroll + Create Storyboard → navigates to wizard with draftId
- WF-B: Editor upload regression — sidebar + Upload Assets dropzone confirmed
- WF-C: Wizard upload new — Upload button + modal open/close confirmed
- WF-D: Editor AI generation — AiGenerationPanel renders in editor with capability tabs
- WF-E: Wizard AI generation — AiGenerationPanel renders in wizard AI tab; backend endpoint exists

Key gotchas discovered during Playwright sweep:
- FE uses `localStorage.auth_token` for auth — must inject via Playwright `storageState` before navigation; `page.evaluate(() => fetch(...))` from null origin hits CORS
- Draft creation API body must be `{ promptDoc: { schemaVersion: 1, blocks: [] } }` not `{ schemaVersion, blocks }` directly
- Draft API response returns `{ id: ... }` at root level (not `{ draftId }` or `{ draft: { draftId } }`)
- Console 404s (editor) and 500s (wizard) are pre-existing known issues — not Batch 2 regressions
- `POST /generation-drafts/:id/ai/generate` returns 400 on empty params (not 500) — endpoint reachable, validation working

**How to apply:** Batch 2 is fully complete. active_task.md should be empty (orchestrator will delete it). Next task should start from a fresh active_task.md.
