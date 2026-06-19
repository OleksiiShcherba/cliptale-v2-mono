---
id: T19
title: "Guardrail conformance test suite over the curated red-team prompt set"
layer: "tests"
deps: ["T8"]
acs: []
files_hint:
  - "apps/api/src/services/__tests__/motionGraphicGuardrail.test.ts"
owner: "Security Lead"
estimate: "S"
status: "todo"
---

# T19 — Guardrail conformance suite (red-team)

## Why

The §6 NFR requires ≥95% refusal of a curated red-team set before generation runs — the guardrail mechanism (T8) needs a conformance measurement. Derives from [spec §6 NFR, §8 OQ-4](../spec.md) + [ADR-0007](../adr/0007-server-side-prompt-guardrail-and-runtime-allowlist.md) + [sad §10 QG-2](../sad.md).

## What

Add a conformance suite that runs the **Security-Lead-owned red-team prompt set** (exfiltration / system-subversion intent) through the guardrail (T8) and asserts the refusal rate ≥95%, plus a benign-prompt set asserting it is **not** over-refusing. Check the prompt set + threshold in as fixtures.

## Definition of Done

- [ ] Red-team prompt set + threshold checked in as fixtures
- [ ] Suite asserts ≥95% refusal over the red-team set (§6 NFR) and a low false-positive rate on benign prompts
- [ ] Runs in CI; lint + vet clean

## Notes

- **Blocked on spec OQ-4** — the curated red-team set + exact threshold are owed by the Security Lead **before plan-tests** (spec §8). This task ships the harness; the set is the OQ-4 deliverable.
- Tests the T8 mechanism — no production code here.
