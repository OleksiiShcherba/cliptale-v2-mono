---
status: Superseded-in-place
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-20"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0002 — LLM provider for Motion Graphic code authoring

- **Status:** Accepted (revised 2026-06-20 — reversed to OpenAI; see "Revision" below)
- **Date:** 2026-06-17 (original), 2026-06-20 (revision)
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Revision (2026-06-20) — reverse to the existing OpenAI service

**Decision changed to Option 2 (OpenAI).** The Motion Graphic authoring stream now
runs through the platform's **already-integrated OpenAI service** (`openai` SDK,
`config.openai.model`, default `gpt-4o`) instead of adding Anthropic.

**Why the reversal:**
- The runtime environment (docker-compose, `.env`) only ever provisioned
  `APP_OPENAI_API_KEY`; `APP_ANTHROPIC_API_KEY` was never wired into the `api`
  service, so the feature could not boot as originally shipped (config required the
  Anthropic key with `.min(1)`).
- Reusing the existing OpenAI integration removes a second LLM provider, a second
  SDK, and a second API key from the codebase — lower operational surface.
- OpenAI provides automatic prompt caching for the stable system prefix, so the
  TTFT/prompt-cache rationale below still holds without provider-native
  `cache_control`.

**What changed in code:** `lib/openai.ts` singleton replaces `lib/anthropic.ts`;
`motionGraphicAuthoring.service.ts` streams `openai.chat.completions.create({stream:true})`
and reads `choices[0].delta.content`; the system prompt is the leading `system`
message; `config.openai` replaces `config.anthropic`; cost lookups key on
`config.openai.model`. The SSE wire protocol (ADR-0003) and all gates are unchanged.

---

## Original decision (2026-06-17) — superseded by the revision above

## Context

The feature's core capability is an AI that authors and iteratively refines a Remotion TSX component from natural-language prompts across a persistent multi-turn chat. The repo already uses the OpenAI SDK (`gpt-4o-mini`) for text tasks (storyboard planning, prompt enhancement) inside media-worker. We must choose the LLM provider for code authoring.

## Decision drivers

- Code-generation quality on Remotion/React TSX — the authored component must run and obey the deterministic-render rule (AC-09); generation success-rate KPI ≥ 80% (spec §7).
- Persistent multi-turn authoring chat (US-04, US-05) — benefits from provider-native streaming + prompt-caching of the system prompt + the Remotion runtime-API contract + prior turns.
- TTFT ≤ 3 s p95 (spec §6 NFR).

## Considered options

1. **Anthropic Claude** (`@anthropic-ai/sdk`) — a new dependency; streaming + prompt-caching; default authoring model `claude-opus-4-8` (`claude-sonnet-4-6` as a cheaper tier).
2. **OpenAI** (existing SDK, `gpt-4o`/`gpt-4o-mini`) — already integrated; no new dependency.

## Decision outcome

**Originally chosen:** Option 1 (Anthropic Claude). Claude is stronger at the code-generation task at the heart of this feature, and its prompt-caching amortizes the large fixed prefix (system prompt + Remotion runtime contract + chat history) across the iterate loop, directly serving the TTFT NFR and cost-estimate↔actual KPI. The new SDK dependency is justified by the feature's reliance on code-gen quality.

> **Superseded 2026-06-20:** reversed to Option 2 (OpenAI) — see the "Revision" section at the top. The OpenAI service was already integrated and provisioned in every environment; Anthropic was not.

## Consequences

**Positive**
- Best-in-class code-gen for the authored Remotion component → higher generation success rate.
- Prompt-caching + streaming fit the persistent-chat authoring loop and the TTFT target.

**Negative**
- A second LLM provider + SDK in the codebase (`@anthropic-ai/sdk` alongside `openai`); a second API key (`APP_ANTHROPIC_API_KEY`) to manage in `config.ts`.

**Neutral**
- Model id is a config value; swapping Claude tiers (opus/sonnet) is a one-line change, not a re-architecture.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0003-server-sent-events-for-generation-streaming]] · [[0007-server-side-prompt-guardrail-and-runtime-allowlist]]
