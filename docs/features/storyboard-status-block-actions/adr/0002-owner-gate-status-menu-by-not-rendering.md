---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-05-30"
feature_size: "S"
ticket: "storyboard-status-block-actions"
---

# 0002 — Owner-gate the status menu by not rendering it for non-owners

- **Status:** Accepted
- **Date:** 2026-05-30
- **Deciders:** Tech Lead, Security Lead

## Context

The kebab (⋮) status menu is the sole host of the Regenerate and Hide actions. A signed-in user who is not the Creator (owner) of a draft must not be able to trigger either action (AC-09). Separately, the "Ref"-box removal and visual-consistency styling must apply to **every** viewer regardless of ownership (AC-04) — only the menu is owner-gated. The signed-in user id is available client-side via `useAuth()`; the draft's owner id is available on the loaded draft. We must decide how the gate is implemented.

## Decision drivers

- Authorization: both actions reserved for the draft's Creator (AC-09, spec §6.1 AuthZ).
- No new server authorization boundary — generation ownership is already enforced server-side; Hide is pure client session state (spec §6.1).
- The UI must not expose either action to non-owners (spec §6.1: "must not expose either action to non-owners").
- Visual consistency (Ref removal) is independent of ownership and applies to all viewers (AC-04).

## Considered options

1. **Do not render the menu for non-owners** — when `useAuth()` user id ≠ draft owner, the kebab is absent from the DOM entirely; neither action exists.
2. **Render but disable the menu** — show the kebab for everyone, disable the actions for non-owners.
3. **Add a server-side authorization check for the actions** — introduce a backend authz boundary specifically for Hide / Regenerate.

## Decision outcome

**Chosen:** Option 1. The kebab is conditionally rendered on `isOwner` (signed-in user id === draft owner id); for a non-owner it is not emitted at all, so neither Regenerate nor Hide is reachable or even discoverable (AC-09). The "Ref"-removal and visual-consistency styling are rendered unconditionally, independent of the ownership check (AC-04). No server boundary is added: Regenerate's underlying generation already enforces ownership server-side, and Hide never leaves the client.

## Consequences

**Positive**
- Matches the spec's literal requirement ("not rendered at all") — strongest affordance-hiding posture; non-owners get no hint the actions exist.
- Zero new backend surface; reuses the existing server-side ownership enforcement as the real security boundary.

**Negative**
- Client-side gating alone is not a security boundary for Regenerate — but it does not need to be, because the generation backend independently rejects non-owner starts. Documented so reviewers don't mistake the render-gate for the enforcement point.

**Neutral**
- Requires the draft owner id to be available to the controls component (already loaded with the draft).

## Links

- Spec: [[../spec.md]] (US-04; AC-04, AC-09; §6.1)
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0001-reuse-generation-start-path-gated-by-action-type]]
