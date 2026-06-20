---
id: T8
title: "motionGraphicGuardrail.service — pre-generation prompt guardrail + runtime allowlist"
layer: "app"
deps: []
acs: []
files_hint:
  - "apps/api/src/services/motionGraphicGuardrail.service.ts"
owner: "Security Lead"
estimate: "M"
status: "todo"
---

# T8 — motionGraphicGuardrail.service (guardrail + allowlist)

## Why

With unsandboxed browser execution (ADR-0005), the server-side prompt-guardrail + a minimal runtime allowlist are the two controls protecting a Creator's own session. Derives from [ADR-0007](../adr/0007-server-side-prompt-guardrail-and-runtime-allowlist.md) + [spec §6 NFR, §6.1](../spec.md) (resolves OQ-2).

## What

Add `apps/api/src/services/motionGraphicGuardrail.service.ts` with: (1) a pre-generation prompt check that refuses exfiltration / system-subversion intent before any LLM call (throws `GateError` `motion_graphic.prompt_rejected`, 422); (2) a minimal **reject-by-default** import/runtime allowlist (render runtime + schema lib only) to validate generated code at authoring time.

## Definition of Done

- [ ] Guardrail refuses bad-intent prompts (throws `GateError` `motion_graphic.prompt_rejected`) and passes benign authoring prompts — unit-tested both ways
- [ ] Allowlist accepts render-runtime + schema-lib imports and rejects everything else (reject-by-default)
- [ ] Runs server-side, pre-generation (a tampered client cannot bypass it); the **≥95% red-team threshold** is measured by the conformance suite (T19)
- [ ] lint + vet clean

## Notes

- No specific spec §5 AC (satisfies the §6 NFR guardrail + ADR-0007).
- The curated red-team set + threshold are spec OQ-4 (Security Lead, due before plan-tests) and live in T19 — this task ships the mechanism, T19 measures conformance.
