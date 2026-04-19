---
name: Subtask 4 assetId → fileId removal — architecture review
description: Code-reviewer approval for Subtask 4 (ingest job refactor removing legacy branch). Known issue: ai-generate jobs still write to dropped table.
type: project
---

**Subtask 4 Review Verdict: APPROVED**

Subtask 4 successfully removed the legacy `project_assets_current` path from `ingest.job.ts` and updated related files. All code is compliant with architecture rules:

✓ File placement: correct per Section 3
✓ Naming: verb-first functions (processIngestJob, setFileReady, parseFps), plain noun types (MediaIngestJobPayload)
✓ Imports: proper grouping (Node → external → monorepo → @/absolute)
✓ Tests: 271 lines (under 300), vi.hoisted pattern correct per §10
✓ Contract changes: fileId now required, assetId removed
✓ Coverage: happy path + edge cases (zero duration, audio-only, error handling, cleanup)

**Known Issue (out-of-scope, tracked in backlog):**
- `ai-generate.job.ts:248` and `ai-generate-audio.handler.ts:214` still INSERT into `project_assets_current`
- Table dropped by migration 027
- Scope boundary is legitimate (Subtask 4 = ingest/transcribe; ai-generate deferred to future batch)
- Will cause silent runtime failures if ai-generate jobs run against migration 027+
- Issue documented in Known Issues § line 499, 515

**Why:** Subtask scope was intentionally bounded to ingest.job.ts and transcribe.job.ts. The ai-generate refactor is deferred because it touches a separate code path with different dependencies.

**How to apply:** Do not flag the ai-generate issue against Subtask 4's compliance. It is pre-existing technical debt tracked for a future cleanup batch.
