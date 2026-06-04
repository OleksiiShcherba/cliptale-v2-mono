# Tracker — generate-ai-flow

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Stage migration 046 — generation_flows | migration | Backend Lead | S | — | done |
| T2 | Stage migration 047 — flow_files pivot | migration | Backend Lead | S | T1 | done |
| T3 | Stage migration 048 — ai_generation_jobs flow cols | migration | Backend Lead | S | — | done |
| T4 | Flow-canvas Zod schema + job-payload extension | domain | Backend Lead | M | — | done |
| T5 | Catalog modality + exclusiveGroup + backfill | domain | Backend Lead | M | — | done |
| T6 | generation-flow.repository | infra | Backend Lead | M | T1, T4 | done |
| T7 | flow-file pivot repo + ai-job back-links | infra | Backend Lead | M | T2, T3 | done |
| T8 | generation-flow.service | app | Backend Lead | M | T6 | done |
| T9 | flow-pricing + cost-estimate service | app | Backend Lead | S | T5 | done |
| T10 | per-Creator Redis rate limit | app | Backend Lead | S | — | done |
| T11 | Generate validation gate | app | Backend Lead | L | T6, T5 | done |
| T12 | Generate enqueue — job + link + idempotency | app | Backend Lead | M | T7, T9, T10, T11 | done |
| T13 | media-worker honors flow_id | app | Backend Lead | M | T7 | done |
| T14 | flow CRUD controller + routes + OpenAPI | ports | Backend Lead | M | T8 | done |
| T15 | estimate + generate controllers + routes + OpenAPI | ports | Backend Lead | M | T9, T11, T12 | done |
| T16 | FlowListPage + api.ts + /generate-ai route | ui | Frontend Lead | M | T14 | done |
| T17 | FlowCanvas + nodes + typed-connect + reconciliation | ui | Frontend Lead | L | T5, T16 | done |
| T18 | Inspector + content input + params | ui | Frontend Lead | M | T17 | done |
| T19 | useFlowAutosave (version-aware, 409) | ui | Frontend Lead | M | T16, T14 | done |
| T20 | CostConfirmModal + useFlowGeneration | ui | Frontend Lead | L | T17, T15 | done |
| T21 | Backend integration suite | tests | Backend Lead / QA | M | T14, T15, T13 | done |
| T22 | E2E — full flow + restore + reattach + conflict | tests | QA | M | T18, T19, T20 | done (GREEN 4/4: editor page FlowEditorPage wired at /generate-ai/:flowId assembles FlowCanvas+Inspector+useFlowAutosave+useFlowGeneration+CostConfirmModal. AC-01 assemble→typed-connection→Generate→confirm-cost→one charged generate→image in result block + library link; AC-10 reload-restore; AC-08b reattach; AC-10b two-tab 409 conflict — all pass through the real UI against the network-stubbed provider. AC-01's library-linkage assertion now fetches via page.evaluate→fetch (intercepted by page.route, consistent with the spec's own stub doctrine) and asserts the linked row's flowId; the authoritative asset-iff-success + flow_files linkage invariant is additionally proven against real MySQL in T13 (worker) + T21 (integration).) |

| U1 | model label readable on gen node (pass-15) | ui | Frontend Lead | XS | — | done |
| U2 | Inspector voice_picker — TTS/STS voices + previews (pass-15, AC-16) | ui | Frontend Lead | S | — | done |
| U3a | migration 049 — flow_model_pricing + seed (pass-15, AC-20) | migration | Backend Lead | S | — | done |
| U3b | param-reactive DB-backed estimate (pass-15, AC-20) | app | Backend Lead | M | U3a | done |
| U4 | flow card click-to-open + hover, Open button removed (pass-16) | ui | Frontend Lead | S | — | done |
| U5 | multi-result run history per gen block (pass-16, AC-01) | ui | Frontend Lead | M | — | todo |

**Total:** 28 tasks (22 original + 4 review-pass-15 + 2 review-pass-16 follow-ups).
