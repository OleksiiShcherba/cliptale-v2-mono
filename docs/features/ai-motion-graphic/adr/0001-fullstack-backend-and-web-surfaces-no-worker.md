---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0001 — Build a fullstack backend-service + web-frontend, no worker in MVP1

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Context

The feature adds a new AI Motion Graphic authoring page plus the server endpoints behind it (graphic CRUD, persistent chat, cost-gate, the LLM streaming proxy, storyboard attachment). The existing AI generations in the repo run as fire-and-forget BullMQ jobs consumed by media-worker. MVP1 executes graphic code only in the browser preview — there is no server-side render. We must decide which C4 containers (target surfaces) the feature introduces.

## Decision drivers

- Time-to-first-streamed-token ≤ 3 s p95 and an interactive describe→iterate chat (spec §6 NFR) — needs a streaming response, not a job-then-poll round trip.
- MVP1 defers all server-side execution/render (spec §3, §8 OQ-1) — no render fleet to feed.
- Reuse the repo's existing api (Express) + web-editor (React SPA) conventions (architecture-map §Module inventory).

## Considered options

1. **`[backend-service, web-frontend]`, no worker** — api hosts a streaming endpoint that proxies the LLM; the new page is a React SPA page.
2. **`[backend-service, web-frontend, worker]`** — route LLM authoring through a BullMQ job like the existing AI generations.

## Decision outcome

**Chosen:** Option 1. The authoring chat is a synchronous streaming interaction; the fire-and-forget BullMQ pattern fits async media generation but not a token-streaming chat with a ≤3 s TTFT target. With no server-side render in MVP1, there is no worker responsibility to introduce. `target_surfaces: [backend-service, web-frontend]` is written to the SAD frontmatter.

## Consequences

**Positive**
- Streaming chat is served directly from the api over SSE (ADR-0003) — meets the TTFT NFR.
- Smaller surface: no new queue, no new worker deployment unit.

**Negative**
- A new synchronous LLM-proxy responsibility on the api, distinct from the existing async-job model.

**Neutral**
- The deferred server-side export milestone will add a `worker` surface later (a new ADR at that time), not a rewrite of MVP1.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0003-server-sent-events-for-generation-streaming]]
