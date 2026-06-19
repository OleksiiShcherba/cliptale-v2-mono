---
id: T9
title: "motionGraphicAuthoring.service — Anthropic streaming proxy with SSE framing"
layer: "app"
deps: ["T3", "T7", "T8"]
acs: ["AC-05", "AC-11"]
files_hint:
  - "apps/api/src/services/motionGraphicAuthoring.service.ts"
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T9 — motionGraphicAuthoring.service (Anthropic SSE proxy)

## Why

Generation/refinement streams Claude's authored code into the chat in real time, behind the pre-stream gates. Derives from [ADR-0002](../adr/0002-anthropic-claude-for-code-authoring.md) + [ADR-0003](../adr/0003-server-sent-events-for-generation-streaming.md) + [sad §6 flows 1 & 3](../sad.md).

## What

Add `apps/api/src/services/motionGraphicAuthoring.service.ts`: build the system prompt + Remotion runtime-API contract (+ prior chat history for refine), run the **pre-stream gates in order** — description-length (AC-05, generate only), cost re-validation (T7 / AC-11), prompt-guardrail (T8) — surfacing any failure as a thrown `GateError` *before* the stream opens, then stream Claude tokens (Anthropic streaming helper) and expose them as the `event: token` / `event: done` / `event: error` SSE frame protocol (ADR-0003). Use prompt-caching for the fixed prefix.

## Definition of Done

- [ ] Gates run before any token streams; a gate failure throws (no SSE frame) so the endpoint returns JSON 4xx (AC-05/AC-11)
- [ ] On pass, Claude tokens relay as ordered `token` frames terminated by `done`; mid-stream upstream/transport failure emits `error`
- [ ] System prompt + runtime contract + history use prompt-caching (TTFT ≤ 3 s, ADR-0002); model id read from config (T3)
- [ ] Unit/contract test on gate-ordering + frame shapes; lint + vet clean

## Notes

- This service produces the stream; the **HTTP** wiring (open `text/event-stream`, map thrown gates → 422) is the endpoint task T11.
- No persistence here — the browser persists the verdict via T10's create/turns endpoints.
