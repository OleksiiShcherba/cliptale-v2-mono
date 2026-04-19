---
name: Batch-6 Guardian remediation verification anchors
description: Post-Batch-6 invariants (mimeToKind canonical in project-schema, cors.test Pattern B live-verified) future reviews can grep-verify
type: project
---

Batch 6 (2026-04-19) closed the two P1/P2 concerns from Batch 5. Verifiable anchors.

**S8.1 cors.test.ts — Pattern B fix (P1):**
- `apps/api/src/__tests__/infra/cors.test.ts` lines 30-44: top-level `const corsReachable = existsSync(corsPath)` → `if (!corsReachable) { describe.skip(...) } else { readFileSync + describe(...) }`. NOT `describe.skipIf`.
- Container-path verify: `sudo docker exec cliptale-v2-mono-api-1 npx vitest run src/__tests__/infra/cors.test.ts` → 1 skipped, zero ENOENT.
- Full-repo path verify: `sudo docker run --rm -v /home/ubuntu/cliptale-v2-mono:/w -w /w node:20-slim bash -c "npm install ... && cd apps/api && npx vitest run src/__tests__/infra/cors.test.ts"` → 10/10 pass.

**S8.2 mimeToKind extraction (P2):**
- Canonical file: `packages/project-schema/src/file-kind.ts` (18L). Exports `type FileKind` (`video|audio|image|document|other`) and `function mimeToKind(mime: string | null | undefined): FileKind`. Includes the `text/* + application/x-subrip → document` branch.
- Re-exported from `packages/project-schema/src/index.ts` lines 1-2.
- Grep-verify: `function mimeToKind|const mimeToKind` across repo = exactly 1 match (packages/project-schema/src/file-kind.ts:10).
- Consumers: `apps/api/src/services/file.service.ts:7` imports `{ mimeToKind, type FileKind }`; `apps/media-worker/src/jobs/ai-generate.utils.ts:10` imports + re-exports; `apps/api/src/repositories/file.repository.ts:3` imports + re-exports FileKind for existing callers; `apps/api/src/__tests__/integration/generation-drafts-cards.fixtures.ts:7` imports + re-exports.
- 14 unit tests (`file-kind.test.ts`) cover all 5 kind branches + null/undefined/empty.

**Behavioral safety of the canonical function's extra `document` branch:**
The old media-worker copy had only 4 branches (video/audio/image/other). Its only live caller is `apps/media-worker/src/jobs/ai-generate.job.ts:196`, which receives `parsed.contentType` from `contentTypeFromExtension(ext, 'image'|'video')` — so `text/*` is unreachable from that call site. The extra branch is purely additive capability; no behavior change for existing callers. Matches the `files.kind` DB ENUM which already accepts `document`.

**Test counts verified live (from repo root, 2026-04-19):**
- project-schema: 114/114 pass (100 existing + 14 new file-kind)
- media-worker: 134/134 pass
- render-worker: 26/26 pass
- api: 887 pass | 6 fail | 5 skipped out of 911. All 6 failures are in the pre-existing Class A (versions-list-restore-endpoint.test.ts) + Class C (assets-finalize/list/stream/delete/endpoints.test.ts) files catalogued in `docs/development_logs.md` lines 276-277. No new failure classes introduced.

**Note on executor count:** Dev log claimed `542 unit pass; 42 integration fail` — actual is `887 pass | 6 fail`, which is BETTER than claimed (the executor appears to have quoted a stale count from a prior split-by-category run; the full `npx vitest run` under singleFork gives the 887/911 number). No concern.

**Reviewer gate:** All Batch-6 dev-log entries carry YES/COMMENTED signatures for all four reviewers. Zero `NOT` or `COMMENTED-but-blocking`.
