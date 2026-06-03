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
| T15 | estimate + generate controllers + routes + OpenAPI | ports | Backend Lead | M | T9, T11, T12 | todo |
| T16 | FlowListPage + api.ts + /generate-ai route | ui | Frontend Lead | M | T14 | todo |
| T17 | FlowCanvas + nodes + typed-connect + reconciliation | ui | Frontend Lead | L | T5, T16 | todo |
| T18 | Inspector + content input + params | ui | Frontend Lead | M | T17 | todo |
| T19 | useFlowAutosave (version-aware, 409) | ui | Frontend Lead | M | T16, T14 | todo |
| T20 | CostConfirmModal + useFlowGeneration | ui | Frontend Lead | L | T17, T15 | todo |
| T21 | Backend integration suite | tests | Backend Lead / QA | M | T14, T15, T13 | todo |
| T22 | E2E — full flow + restore + reattach + conflict | tests | QA | M | T18, T19, T20 | todo |

**Total:** 22 tasks, ~22 person-days.
