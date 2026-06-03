---
id: T20
title: "Build CostConfirmModal + useFlowGeneration (estimate→confirm→generate, progress, reattach, retry, dominant preview)"
layer: "ui"
deps: ["T17", "T15"]
acs: ["AC-01", "AC-08", "AC-08b", "AC-09", "AC-11", "AC-12", "AC-13"]
files_hint: ["apps/web-editor/src/features/generate-ai-flow/components/CostConfirmModal.tsx", "apps/web-editor/src/features/generate-ai-flow/hooks/useFlowGeneration.ts", "apps/web-editor/src/features/generate-ai-flow/components/ResultNode.tsx"]
owner: "Frontend Lead"
estimate: "L"
status: "todo"
---

# T20 — CostConfirmModal + useFlowGeneration

## Why

The Generate experience end-to-end: confirm cost, run the one deliberate action, watch async progress, reattach after a reload, and recover from failure — with the produced media as the dominant area of the result block. Derives from [spec §US-05/06/07 + §AC-01/08/08b/09/11/12/13](../spec.md), [sad §6 Flow 1/2/8 / §8 Result reuse / Retry semantics](../sad.md), [ADR-0001](../adr/0001-reuse-ai-generate-job-pipeline-for-flow-generation.md).

## What

- `components/CostConfirmModal.tsx`: shows the T15 best-effort estimate; **cancel → no call, no charge, flow unchanged** (AC-11).
- `hooks/useFlowGeneration.ts`: on confirm, `POST .../generate` with a client-generated `Idempotency-Key`; subscribe to job progress via the **shared `useJobPolling` + ws `ai-job`** channel; on reopen, reattach to a running job or render the last-known done/failed state from the flow-open job states (AC-08b); a failed run shows the plain-language reason + a **retry** that is a fresh, charged Generate (AC-09).
- `components/ResultNode.tsx`: live progress while running; on completion the produced media is the **dominant** area — image as a large preview, video/audio as a large player (AC-08) — for image/video/audio alike (AC-12/13). The result also appears in the general library (AC-01).

## Definition of Done

- [ ] Confirm runs Generate with an Idempotency-Key; cancel makes no call/charge and leaves the flow unchanged
- [ ] The result node shows live progress, then the dominant media preview on completion (image/video/audio)
- [ ] On reopen, a running job reattaches; a done/failed job shows its last-known state; nothing is lost on tab-close (AC-08b)
- [ ] A failed run shows the reason + a retry (fresh, charged) (AC-09)
- [ ] Hook + component tests cover confirm/cancel, progress, reattach, failed/retry; lint + typecheck clean

## Notes

Depends on T17 (nodes) + T15 (estimate + generate endpoints). Reuse the existing `useJobPolling` / realtime channel — no new channel (sad §8). The server is the authoritative gate; this modal is advisory (a script bypassing it still hits T11/T10/T12).
