---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0006 — Enforce determinism with an author-time AST scan plus a runtime shim

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Context

The deterministic-render rule (AC-09) requires every ready graphic to animate from its frame position (Remotion's `useCurrentFrame`), never from wall-clock time or randomness, so the browser preview is guaranteed to match the future server export frame-for-frame (CONTEXT: Determinism). We must decide how this rule is enforced on AI-authored code before a graphic reaches ready state.

## Decision drivers

- AC-09: a graphic that would animate from wall-clock/randomness must not present as ready.
- Render parity is verified by a CI frame-diff on a fixed fixture set, with **no** per-user-graphic runtime frame-diff (spec §6 NFR) — so enforcement must be static + cheap, not a per-graphic render comparison.
- A clear, plain-language failure for the Creator on a non-deterministic attempt (AC-06, AC-14).

## Considered options

1. **AST scan (author-time) + runtime shim** — a static AST scan rejects `Date.now()`/`new Date()`/`Math.random()`/`performance.now()` before ready; a runtime shim freezes those sources during execution as a backstop.
2. **Runtime shim only** — freeze the sources at execution time, no static scan.

## Decision outcome

**Chosen:** Option 1. The AST scan catches the violation at authoring time with a precise, explainable failure (so the graphic never reaches ready and the Creator gets a clear message), and the runtime shim is defense-in-depth for anything the scan misses. A shim alone gives no early/explainable failure and can't surface "this graphic is non-deterministic" before it would have shipped.

## Consequences

**Positive**
- Non-deterministic graphics are blocked from ready state with a clear reason (AC-06/AC-09/AC-14).
- Two layers: static rejection + runtime freeze.

**Negative**
- The allow/deny list of non-deterministic sources must be maintained; an exotic source (e.g. a network-time fetch) outside the list slips the scan and relies on the shim/allowlist (ADR-0007).

**Neutral**
- The fixture-set CI frame-diff (spec §6 NFR) remains the parity backstop across releases, independent of per-graphic enforcement.

## Links

- Spec: [[../spec.md]] §5 (AC-09), §6
- SAD: [[../sad.md]] §4, §8, §10
- Related ADR: [[0004-transpile-in-browser-and-mount-authored-component]] · [[0007-server-side-prompt-guardrail-and-runtime-allowlist]]
