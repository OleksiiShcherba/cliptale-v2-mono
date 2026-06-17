---
status: Accepted
owner: "Security Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0007 — Refuse malicious prompts server-side and restrict generated code to a minimal allowlist

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Security Lead + Tech Lead + Architect (Socratic design walk)

## Context

With unsandboxed browser execution (ADR-0005), the two controls protecting a Creator's own session are a prompt-guardrail and a narrow runtime surface. We must decide where the guardrail runs and what the generated code is allowed to import/use. This ADR resolves spec §8 OQ-2 ("allowed import/runtime surface + what the guardrail treats as out-of-bounds").

## Decision drivers

- Malicious-prompt guardrail: ≥ 95% of a curated red-team set (exfiltration / system-subversion intent) refused before generation runs (spec §6 NFR).
- The client estimate/intent is never trusted — server re-validates (the repo's instrument-only cost-gate pattern; abuse cases in spec §6.1).
- A minimal, enforceable runtime surface keeps the self-only blast radius small (ADR-0005).

## Considered options

1. **Server-side pre-generation guardrail + minimal authoring-time allowlist** — guardrail refuses bad-intent prompts before the LLM call; generated code is restricted to a minimal import/runtime allowlist (render runtime + schema lib), anything else rejected at authoring time.
2. **Defer to §11 as an Open Question** — record owner+due (Tech Lead, before `sdd:tasks`) and decide the exact allowlist later.

## Decision outcome

**Chosen:** Option 1. The feature introduces a new trust boundary with a mandatory Security review; fixing the guardrail placement (server-side, pre-generation) and the allowlist shape (render runtime + schema lib only, reject-by-default) now gives downstream stages a firm contract and closes spec OQ-2. The guardrail runs server-side so a tampered client cannot bypass it; the allowlist is enforced at authoring time alongside the determinism AST scan (ADR-0006).

## Consequences

**Positive**
- Bad-intent prompts are refused before any generation cost is incurred (meets the §6 guardrail NFR).
- A small, reject-by-default runtime surface bounds what executed code can reach.

**Negative**
- The red-team prompt set + rejection threshold (spec §8 OQ-4) and the exact allowlist must be curated and maintained; false negatives on the guardrail fall back to the self-only blast radius (ADR-0005).

**Neutral**
- The same allowlist/guardrail contract carries forward to the server-side export milestone, tightened there by a real execution sandbox (§8 OQ-1).

## Links

- Spec: [[../spec.md]] §6, §6.1, §8 (OQ-2, OQ-4)
- SAD: [[../sad.md]] §4, §8, §11
- Related ADR: [[0005-no-sandbox-self-only-blast-radius]] · [[0006-ast-scan-and-runtime-shim-for-determinism]]
