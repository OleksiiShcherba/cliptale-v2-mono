---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-05-30"
feature_size: "S"
ticket: "storyboard-status-block-actions"
---

# 0001 — Reuse the existing generation-start path and gate Regenerate safety by action type

- **Status:** Accepted
- **Date:** 2026-05-30
- **Deciders:** Tech Lead, Steven Hayes (PM)

## Context

The completed status blocks gain a **Regenerate** action. Scene-plan Regenerate overwrites the canvas (destructive — discards scenes, illustrations, music, and in-place scene edits as a consequence of the rebuild), while illustration Regenerate produces fresh images without deleting previously generated files (additive). The storyboard hooks already expose a generation-start path for each: `useStoryboardPlanGeneration.start` (aliased as `retry`) which rebuilds the canvas, and `useStoryboardIllustrations.start`. We must decide how Regenerate dispatches and how the destructive-vs-additive safety difference is enforced (spec §6 NFR: "Regenerate reuses the existing generation-start path; this feature owns no new generation-timing budget").

## Decision drivers

- Destructive-action safety: 100% of scene-Regenerate triggers must show the loss-enumerating warning before any overwrite (spec §6, §1 QG-1).
- Single generation per draft — never two concurrent (AC-07 domain invariant).
- No new generation-timing budget; reuse the unchanged start path (spec §6 NFR).
- Frontend-only, no new backend (spec §3 non-goals, §6.1).
- Illustration Regenerate must NOT add a confirmation step (AC-03) — it is additive.

## Considered options

1. **Reuse the existing start path, gate safety by action type** — scene Regenerate → existing destructive plan-start behind a mandatory loss-enumerating confirm; illustration Regenerate → existing additive illustration-start with no confirm.
2. **Confirm both Regenerates** — apply a confirmation modal to the illustration path too, for uniformity.
3. **New unified regenerate service** — build one backend endpoint/service abstracting both generation paths behind a single Regenerate call.

## Decision outcome

**Chosen:** Option 1. Each Regenerate re-invokes the generation-start path that already exists for its block, so no new timing budget or backend surface is introduced. The destructive scene path is wrapped in a mandatory confirmation that enumerates whichever of scenes / illustrations / music presently exist; the additive illustration path runs immediately with no confirmation. The single-generation invariant is structural rather than lock-based: selecting Regenerate immediately moves the block out of its completed state, which removes the status menu — so a rapid duplicate activation has no menu to act on — backed by the existing start-guard in the plan hook (which ignores a start while `queued`/`running`/`applying`).

## Consequences

**Positive**
- Reuses proven start paths — no new generation-timing risk, no backend change.
- Mandatory confirm only where data loss is real (scenes), keeping the additive path frictionless (AC-03).
- Double-trigger protection falls out of the state transition (menu disappears) — no new locking primitive.

**Negative**
- The destructive-confirm contract lives in the frontend; if a future non-UI entry point triggers scene regeneration it would not inherit this guard (out of scope here; backend ownership still enforced).

**Neutral**
- The confirmation's enumerated losses are computed client-side from current draft state at confirm time; categories absent from the draft are omitted (AC-08).
- A Regenerate that races a pending autosave or a second open tab keeps today's last-write-wins behaviour (tracked as a risk in §11).

## Links

- Spec: [[../spec.md]] (US-01, US-02, US-03; AC-01, AC-03, AC-05, AC-07, AC-08)
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-owner-gate-status-menu-by-not-rendering]]
