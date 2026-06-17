---
status: Accepted
owner: "Security Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0005 — Accept unsandboxed browser execution with a self-only blast radius in MVP1

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Security Lead + Tech Lead + Architect (Socratic design walk)

## Context

ADR-0004 executes AI-authored (and potentially prompt-injected) code in the Creator's browser. The code is untrusted input. We must decide the execution isolation posture for MVP1. Per spec §6.1, graphics are strictly per-Creator with no cross-account sharing, so a generated graphic can only ever run in its own author's session.

## Decision drivers

- Graphics are private per-Creator, never shared (spec §3, §6.1) — the blast radius of any executed code is the author's own session, never another account.
- A new trust boundary requires a Security review (spec §6.1).
- Server-side execution (and the isolation a shared render fleet would need) is deferred (spec §3, §8 OQ-1) — there is no shared execution surface in MVP1.

## Considered options

1. **No sandbox + self-only blast radius** — rely on per-Creator/no-sharing scope (self-only blast radius) + the prompt-guardrail (ADR-0007); accept residual self-exfiltration risk.
2. **Sandboxed iframe in MVP1** — isolate browser execution in a sandboxed iframe now.

## Decision outcome

**Chosen:** Option 1, matching spec §6.1. Because execution is browser-only, per-Creator, and never shared, an author can only reach their own session — there is no cross-account path. The accepted residual risk is that an author who defeats the guardrail can exfiltrate their *own* session (self-inflicted only). The sharp server-side RCE/SSRF risk is out of MVP1 scope (no server execution) and re-enters at the export milestone (§8 OQ-1), where an execution sandbox is a precondition.

## Consequences

**Positive**
- Smallest MVP1 surface; the no-sharing invariant does the heavy lifting on blast radius.

**Negative**
- No defense-in-depth against self-exfiltration beyond the guardrail; a guardrail bypass lets an author reach their own session/cookies. **Accepted for MVP1** (self-only).

**Neutral**
- An iframe/worker sandbox can be added later without changing the runtime-mount contract (ADR-0004) — additive hardening.

## Links

- Spec: [[../spec.md]] §6.1, §8 (OQ-1)
- SAD: [[../sad.md]] §4, §11
- Related ADR: [[0004-transpile-in-browser-and-mount-authored-component]] · [[0007-server-side-prompt-guardrail-and-runtime-allowlist]]
