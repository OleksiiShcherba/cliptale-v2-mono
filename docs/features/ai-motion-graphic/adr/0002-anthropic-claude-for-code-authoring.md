---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0002 — Use Anthropic Claude for Motion Graphic code authoring

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

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

**Chosen:** Option 1 (Anthropic Claude). Claude is stronger at the code-generation task at the heart of this feature, and its prompt-caching amortizes the large fixed prefix (system prompt + Remotion runtime contract + chat history) across the iterate loop, directly serving the TTFT NFR and cost-estimate↔actual KPI. The new SDK dependency is justified by the feature's reliance on code-gen quality.

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
