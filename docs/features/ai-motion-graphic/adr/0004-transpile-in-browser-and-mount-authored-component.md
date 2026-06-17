---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0004 — Transpile authored TSX in the browser and mount it into a runtime Remotion composition

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead + Security Lead (Socratic design walk)

## Context

A Motion Graphic is code-defined (CONTEXT glossary): the AI authors a Remotion component whose visuals/animation are arbitrary code. The repo's existing Remotion compositions are static, compiled into the `packages/remotion-comps` bundle and registered at build time (`registerRoot`); there is no runtime-code path, and the web-editor mounts a fixed `VideoComposition` into `<Player>`. We must decide how per-graphic AI-authored code executes in the browser live preview.

## Decision drivers

- The graphic is "source code that is executed to produce frames" (CONTEXT glossary) — expressiveness must not be capped to a fixed schema.
- Live preview ready ≤ 1500 ms after a code change, including transpile + runtime init (spec §6 NFR).
- Determinism (AC-09) and the security posture (ADR-0005, ADR-0006) constrain what the executed code may do.

## Considered options

1. **Transpile-in-browser + dynamic component mount** — author full Remotion TSX; transpile in-browser (Sucrase / Babel-standalone) and mount the resulting component into a runtime composition wrapper fed to `<Player>`.
2. **Declarative JSON-spec interpreter** — the AI emits a constrained JSON animation spec that a fixed, compiled renderer interprets.

## Decision outcome

**Chosen:** Option 1. The product thesis is deterministic *code-rendered* output (the glossary's "code-defined" Motion Graphic); a JSON-spec interpreter would cap expressiveness and contradict that. The browser transpiles the authored TSX and mounts it into a runtime composition wrapper. This introduces a runtime-code path that the repo does not have today — its determinism is enforced by ADR-0006 and its trust boundary by ADR-0005.

## Consequences

**Positive**
- Full expressiveness — any Remotion-expressible text/UI motion, matching the product wedge.
- Preview and the future server export run the same authored component → parity by construction (with AC-09).

**Negative**
- Introduces in-browser transpilation + dynamic execution of AI-authored code — a new trust boundary (drives ADR-0005) and a new build-surface dependency (a browser transpiler).
- Transpile cost is inside the 1500 ms preview budget — needs a fast transpiler (Sucrase-class), not a full Babel pass.

**Neutral**
- The same runtime-wrapper contract is the seam the deferred server-side export milestone will execute against.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0005-no-sandbox-self-only-blast-radius]] · [[0006-ast-scan-and-runtime-shim-for-determinism]]
