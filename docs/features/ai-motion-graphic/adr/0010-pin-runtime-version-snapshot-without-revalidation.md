---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0010 — Pin the rendering-runtime version and snapshot at attach without re-validation

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Context

Motion Graphics are code authored against a specific Remotion rendering-runtime version (the repo pins Remotion 4.0.443 via root overrides). When the runtime version changes, older saved graphics may stop rendering (asset-rot). We must decide whether an attached snapshot is re-validated against the pinned runtime at attach time. This ADR resolves spec §8 OQ-3 (due before design completes).

## Decision drivers

- The repo already hard-pins Remotion 4.0.443 and forbids piecemeal bumps (architecture-map §Constraints) — graphics author against one known runtime.
- A placed instance is a frozen snapshot, unchanged by later edits (AC-10) — predictability over liveness.
- MVP1 surface is deliberately small (spec §3); re-validation/migration of old graphics is a later concern.

## Considered options

1. **Pin the runtime version; snapshot at attach without re-validation** — record the runtime version a graphic is authored against; freeze code+duration at attach without re-checking against the pinned runtime; defer re-validation/migration of old graphics.
2. **Re-validate the snapshot against the pinned runtime at attach time** — run a compatibility check on attach.

## Decision outcome

**Chosen:** Option 1, matching spec OQ-3's default. Graphics author against the single pinned Remotion version; the snapshot freezes code+duration at attach with no re-validation, consistent with the frozen-instance semantics (AC-10) and the small MVP1 surface. Asset-rot from a future runtime bump (and any re-validation/migration of old graphics) is an explicit later concern, tracked as accepted debt in §11.

## Consequences

**Positive**
- Simple, predictable attach — a snapshot is an immutable freeze, no compatibility gate to build in MVP1.
- Aligns with the repo's single-pinned-Remotion constraint.

**Negative**
- A future Remotion bump may break older saved graphics with no automated migration in MVP1 — **accepted debt** (§11); a graphic authored on an old runtime is not guaranteed to render on a newer one.

**Neutral**
- The recorded runtime version is the hook a later milestone uses to drive re-validation/migration — additive.

## Links

- Spec: [[../spec.md]] §8 (OQ-3)
- SAD: [[../sad.md]] §8, §11
- Related ADR: [[0009-separate-snapshot-table-for-code-backed-block-media]] · [[0004-transpile-in-browser-and-mount-authored-component]]
