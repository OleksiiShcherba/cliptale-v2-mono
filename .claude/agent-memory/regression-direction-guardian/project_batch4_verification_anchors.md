---
name: Batch-4 assetId→fileId cleanup verification anchors
description: Post-Batch-4 invariants + two regression classes future Guardian passes must grep-verify (cors.test.ts Docker-mount, render-worker project_assets_current)
type: project
---

**Batch 4 (2026-04-19) shipped the assetId→fileId rename cleanup + S3 CORS fix. Two regression classes emerged that future Guardian passes must verify directly against the code, not the dev log.**

**Why:** Senior-dev flagged "Node not installed; test will run in CI" for `apps/api/src/__tests__/infra/cors.test.ts` — it actually fails at runtime inside the `api` Docker container because `/app/infra/` is not mounted. Also, Known Issues listed only `ai-generate.job.ts` + `ai-generate-audio.handler.ts` as writing to the dropped `project_assets_current` table, but `apps/render-worker/src/jobs/render.job.ts:141` does the same READ, and its `.assetId` access at `:128-133` is stale vs the current `fileId`-based `clipSchema`. Rendering any project will silently resolve to empty asset URLs (black output).

**How to apply:** When reviewing any future batch in this repo:
1. **cors.test.ts mount check** — Before trusting any test that reads a file outside its own workspace, run `sudo docker compose exec -T api sh -c "cd /app/apps/api && npx vitest run --reporter=dot"` and confirm the test file is in the PASS list, not the FAIL list. The api container only mounts `./apps/api/src`, `./packages/project-schema`, `./packages/api-contracts`. No `/app/infra`, no repo root. Cross-workspace file reads at test time need either (a) a Dockerfile COPY of the source-of-truth into the image, or (b) inlined constants in the test.
2. **project_assets_current callers roster** — The authoritative list of remaining callers is:
   - `apps/media-worker/src/jobs/ai-generate.job.ts:248` (INSERT)
   - `apps/media-worker/src/jobs/ai-generate-audio.handler.ts:214` (INSERT)
   - `apps/render-worker/src/jobs/render.job.ts:141` (SELECT) — **NOT in dev-log Known Issues; add when reporting**
   - Integration test seeds listed under Class C (5 files in `apps/api/src/__tests__/integration/assets-*-endpoint.test.ts`)
   Grep `project_assets_current` in `apps/` and compare — any new hit is either a new call site (regression) or a stale caller that was missed.
3. **MediaIngestJobPayload contract** — `fileId: string` is now required, `assetId` field removed. Every caller in the monorepo passes `fileId`; verified via `grep -r "MediaIngestJobPayload"`. Safe; no external consumers of this type.
4. **Test counts after Batch 4** (grep-verified anchors):
   - project-schema 100/100
   - editor-core 10/10
   - remotion-comps 61/61
   - media-worker 134/134 (14 files)
   - api 887/910 (6 fail: 1 cors regression + 5 Class C + 0 Class A under live compose; Class A surfaces only when JWT user != bypass user)
5. **Uncommitted state warning** — as of 2026-04-19 all of Batch 2 + Batch 3 + Batch 4 is on `fix/docker-dev-deploy` as unstaged/untracked. Git log last batch-related commit: `8de43b9 [QA-VERIFIED] Subtask 6: Rename wire DTO assetId → fileId (remove compat shim)`. If a future Guardian sees clean working tree, the batch was finally committed — note the hash for the anchor.

**Mnemonic for future passes:** "Three silent callers, one broken test, one uncommitted tree" = Batch-4 closure debt.
