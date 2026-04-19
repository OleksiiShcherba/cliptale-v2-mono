---
name: Batch 5 Guardian Remediation progress
description: Guardian remediation after Files-as-Root Batch 5; 2 subtasks; ALL COMPLETE (2026-04-19)
type: project
---

Task: migration/batch5-guardian-remediation on branch fix/docker-dev-deploy

**Why:** Guardian re-run after Batch 5 returned 2 CONCERNS that prior senior-dev shipped with only static analysis (no live verification).

Current state (2026-04-19):
- Subtask 1 (cors.test.ts Pattern B fix) — COMPLETE (2026-04-19), live-verified
- Subtask 2 (mimeToKind + FileKind extraction to project-schema) — COMPLETE (2026-04-19)

Key findings from Subtask 1:
- `describe.skipIf(!condition)` does NOT prevent the describe callback body from executing during test collection — only `it()` bodies are skipped. Any `readFileSync` or other file-system calls inside the describe callback will still run and ENOENT if the file is absent.
- Pattern B (top-level `if (!reachable) { describe.skip(...) } else { const data = readFileSync(...); describe(...) }`) is the correct fix. The `readFileSync` is gated inside the `else` branch which is never entered when the file is absent.
- Live container verification command: `sudo docker exec cliptale-v2-mono-api-1 npx vitest run src/__tests__/infra/cors.test.ts` — confirmed clean skip (no ENOENT, 1 test skipped).
- Full-repo: `sudo docker run --rm -v /home/ubuntu/cliptale-v2-mono:/w -w /w node:20-slim bash -lc "cd /w && npm install --no-audit --no-fund --silent && npm run test --workspace=apps/api -- src/__tests__/infra/cors.test.ts"` — 10/10 pass.

**How to apply:** For any vitest test that needs to conditionally skip based on file/resource availability, use top-level `if/else` branching (Pattern B), never `describe.skipIf` wrapping a callback that contains the failing resource access.
