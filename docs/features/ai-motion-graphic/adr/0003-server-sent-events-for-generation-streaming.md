---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0003 — Stream generation tokens to the browser over Server-Sent Events

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Context

Authoring and refining a Motion Graphic streams the LLM's output (code + progress) into the chat in real time. The repo already has a `ws`+Redis pub/sub realtime channel used to push worker progress. We must choose how generation tokens reach the browser, given a one-way producer→consumer flow.

## Decision drivers

- Time-to-first-streamed-token ≤ 3 s p95; live preview ready ≤ 1500 ms after a code change (spec §6 NFR).
- The flow is one-way (server→client) token streaming for the duration of one generation — no client→server mid-stream messaging.
- The LLM call is served synchronously from the api (ADR-0001), not via the worker/Redis path.

## Considered options

1. **Server-Sent Events (SSE)** from the api — a single HTTP streaming response per generation.
2. **Existing WebSocket** (`ws` + Redis pub/sub) — reuse the realtime channel.
3. **Polling** — client polls a generation-status endpoint.

## Decision outcome

**Chosen:** Option 1 (SSE). A generation is a one-way token stream with a natural lifetime (one request); SSE maps onto it directly and onto the Anthropic SDK's streaming helper, with the lowest machinery. The WebSocket path is built for bidirectional worker-progress fan-out via Redis and is heavier than a one-way token stream needs; polling cannot meet the TTFT target.

## Consequences

**Positive**
- Minimal transport that meets TTFT ≤ 3 s; backpressure and connection lifetime are per-request.
- Decoupled from the worker/Redis realtime path — no cross-traffic with media-job progress.

**Negative**
- A new SSE endpoint pattern in an api that otherwise does request/response + WebSocket.

**Neutral**
- If a later milestone needs bidirectional mid-generation steering, it can move to the existing WebSocket path — a contained change.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0001-fullstack-backend-and-web-surfaces-no-worker]] · [[0002-anthropic-claude-for-code-authoring]]
