---
name: Batch-5 verification anchors (post-Batch-4 guardian cleanup)
description: Verified results for Batch 5 (2026-04-19) — render-worker + ai-generate refactor; cors.test.ts fix attempt failed; mimeToKind copies already drifted
type: project
---

Batch 5 (post-Batch-4 guardian findings, 2026-04-19) touched three subtasks. Live verification on a fresh docker exec run:

**Subtask 1 — render-worker to files/fileId: VERIFIED CLEAN.**
- `apps/render-worker/src/jobs/render.job.ts::resolveAssetUrls` now filters on `'fileId' in c`, queries `SELECT file_id, storage_uri FROM files WHERE file_id IN (?)`, keys the returned map by `fileId`.
- `grep -r assetId|asset_id|project_assets_current apps/render-worker/src/` → 0 hits.
- Test suite: 26/26 pass (20 prior + 6 new regression tests: text-overlay+caption exclusion, image clips, mixed clips, orphan safety, SQL-query guard).

**Subtask 2 — ai-generate to filesRepo+setOutputFile: VERIFIED CLEAN, with a latent maintenance concern.**
- `apps/media-worker/src/jobs/ai-generate.job.ts` and `ai-generate-audio.handler.ts` no longer contain `project_assets_current` or any legacy INSERT — both now call `deps.filesRepo.createFile(...)` → `deps.aiGenerationJobRepo.setOutputFile(jobId, fileId)`.
- Worker-local thin repos in `apps/media-worker/src/index.ts` (no cross-app import); `draft_files` pivot populated via setOutputFile's INSERT IGNORE when `draft_id` is set.
- `voice_cloning` path unchanged (produces a voice_id, not a file).
- Test suite: 134/134 media-worker pass.
- **Latent concern — mimeToKind duplicates have drifted:** both files' header comments say "Keep both copies in sync", but they are NOT:
  - Canonical `apps/api/src/services/file.service.ts:43` → has a `document` branch for `text/*` and `application/x-subrip`.
  - Media-worker copy `apps/media-worker/src/jobs/ai-generate.utils.ts:43` → only video/image/audio, else `'other'`.
  - Not a runtime bug today because fal.ai / ElevenLabs callers only pass `video/`, `image/`, `audio/*` MIMEs; but if the worker ever generates a subtitle/document file the kind will silently become `'other'`.

**Subtask 3 — cors.test.ts container-mount skip: CLAIMED DONE, ACTUALLY STILL BROKEN.**
- The fix attempted was `describe.skipIf(!corsReachable)` with `readFileSync` moved inside the describe callback. Senior-dev admitted "No Docker/Node runtime was available on this host; the logic is correct by static analysis."
- **Static analysis was wrong.** Vitest evaluates the describe callback body at test-collection time even when `skipIf(true)` — the callback only *skips the `it()` bodies*. Therefore the top-of-callback `JSON.parse(readFileSync(corsPath))` at line 40 still fires and still throws ENOENT, failing the whole suite as `0 tests / 1 failed suite`.
- Live evidence from `sudo docker exec cliptale-v2-mono-api-1 npx vitest run src/__tests__/infra/cors.test.ts`: stderr shows the "[cors.test] skipped" warning AND then `ENOENT: no such file or directory, open '/app/infra/s3/cors.json'` at `cors.test.ts:40:33`, with result `Test Files 1 failed`.
- Correct fix patterns: guard the JSON.parse INSIDE each `it()`, or short-circuit with `if (!corsReachable) { describe.skip(..., () => { it(...); }); return; }`, or use `it.skipIf` on the individual assertions. The current pattern fails every time the api container runs vitest.

**Full api test suite (Docker-exec inside running api container): 879 pass / 14 fail / 4 skip.**
Failure triage:
- Class A (pre-existing DEV_AUTH_BYPASS user-mismatch): `versions-list-restore-endpoint.test.ts` (1 failure) — unchanged from Batch 4.
- Class C (pre-existing stale-seed debt into dropped project_assets_current): `assets-delete` (3), `assets-endpoints` (2), `assets-finalize` (suite load failure), `assets-list` (suite load failure), `assets-stream` (suite load failure) — unchanged from Batch 4's Known Issues; not in Batch 5 scope.
- `cors.test.ts` (1 failed suite) — **Batch 5 regression: Subtask 3 claimed to fix it but did not. Was effectively pre-existing + now mislabeled as fixed.**
- `generation-drafts-cards.endpoint.test.ts` (4 fail) + `generation-drafts-cards.shape.test.ts` (4 fail) — singleFork `process.env` pollution from sibling files that set `APP_DEV_AUTH_BYPASS='true'` at module-load time. The two files here set it to `'false'` but execute after. Pre-existing from Batch 3 split; not in Batch 5 scope. Also fails single-file with `@/*` alias resolution (pre-existing vitest infra issue).

**Uncommitted tree:** Batch 5 edits are still uncommitted (`git status` = modified across render-worker/media-worker/api/fixtures, plus memory files). Recent commit `db2d093` is the prior deploy fix, not Batch 5.

**Verification commands that work:**
- `sudo docker exec cliptale-v2-mono-api-1 sh -c 'cd /app && npm run test --workspace=apps/api'`
- `sudo docker run --rm -v /home/ubuntu/cliptale-v2-mono:/app -w /app node:20-slim sh -c 'npm run test --workspace=apps/media-worker'`
- `sudo docker run --rm -v /home/ubuntu/cliptale-v2-mono:/app -w /app node:20-slim sh -c 'npm run test --workspace=apps/render-worker'`
