# Changelog — ai-motion-graphic

## ai-motion-graphic — AI-authored, code-backed Motion Graphics: describe → generate → refine → reuse in storyboards & projects

**What:** A new **AI Motion Graphic** surface, peer to Projects / Storyboard / Generate AI, where a Creator describes a graphic in plain language, an AI authors a reusable **code-backed Motion Graphic** (Remotion/TSX), previews it playing in real time, and refines it over a persistent **chat history** that stays the graphic's editable source. Each graphic carries a fixed **animation duration** the Creator sets above the chat; the AI authors the animation to fit. A graphic is then a first-class, per-Creator reusable asset: it can be attached to a **storyboard block** as media (frozen code+duration snapshot, AC-04) **and** added to a **project timeline** on the `/editor` page as a new `motion-graphic` clip that renders in the live preview. Reuse-by-duplication seeds the copy with a live, re-runnable chat history (AC-12). Generations are gated by the existing **cost-estimate + confirm** mechanism, and every authored graphic must pass a **deterministic-render rule** (animates strictly from frame position, never wall-clock/`Math.random`) before it can reach `ready` — guaranteeing the preview matches a future export.

**Why:** Diffusion-based AI video renders on-screen text/UI worst — warped letters, frame-to-frame drift, no cross-episode consistency. No competitor pairs a describe→iterate-in-chat loop with deterministic, code-rendered output that lives as a reusable asset inside an editor. See [spec](./spec.md) §1–§5. Load-bearing decisions: [ADR-0002](./adr/0002-anthropic-claude-for-code-authoring.md) — code authoring uses the platform's **existing OpenAI service** (`gpt-4o`), not Anthropic (revised, Superseded→OpenAI); [ADR-0006](./adr/0006-ast-scan-and-runtime-shim-for-determinism.md) — animation is **frame-based** (AST scan + runtime shim) so preview/export parity is provable; [ADR-0005](./adr/0005-no-sandbox-self-only-blast-radius.md) — MVP1 executes authored code **only in the author's own browser preview** (graphics are never shared → self-only blast radius), with a [ADR-0007](./adr/0007-server-side-prompt-guardrail-and-runtime-allowlist.md) prompt-guardrail refusing exfiltration/subversion intent. Server-side execution / final video export of a graphic is deliberately **deferred** (spec §3, §8 OQ-1).

**How to use:** New nav entry **"AI Motion Graphics"** → `/motion-graphics` (list, US-01) → `/motion-graphics/new` (author) and `/motion-graphics/:id` (resume chat, US-05). Generation/refinement stream over the motion-graphic SSE endpoints; the client transpiles the authored TSX (Sucrase) and plays it in a Remotion `<Player>` (`autoPlay loop controls`). On the project page (`/editor`), the left-sidebar **"Motion"** tab lists ready graphics with **Add to timeline**, which freezes the graphic's code+geometry into a `motion-graphic` clip on a new video track. Attaching to a storyboard block stores the snapshot for the future render but does not itself produce exported frames in MVP1.

**Operational notes:**
- **Migrations (run on deploy):** adds **058–063**. Notably **062** seeds `flow_model_pricing` for `gpt-4o`/`gpt-4o-mini` at `per_second = 0.01` so the server cost re-validation matches the client's `MOTION_GRAPHIC_COST_PER_SECOND` (without it, AC-11 422s every generation); **063** adds `motion-graphic` to the `project_clips_current` clip-type ENUM so timeline clips persist. Migrations run on api boot.
- **Config:** `APP_OPENAI_API_KEY` (required for real authoring) + `APP_OPENAI_MODEL` (default `gpt-4o`); replaces the removed `APP_ANTHROPIC_*`. The key loads from `.env` on `docker compose up` — a bare `docker restart` leaves it empty.
- **Package build:** `@ai-video-editor/project-schema` gained the `motion-graphic` clip type → must be rebuilt (`npm run build -w @ai-video-editor/project-schema`); both web (vite) and api resolve it via `dist`.
- **Rollback:** revert the feature branch / redeploy. Migration 063 only adds an ENUM value and 062 is an `INSERT IGNORE` pricing seed — both are additive and safe to leave; no destructive data change to reverse.

**Acceptance criteria delivered (all PASS — clean-context review record `_review/`, plus live OpenAI visual verification + an independent decider):**
- AC-01 — generate a graphic sized to the chosen duration with an auto title; ready to preview.
- AC-02 — live preview fills the canvas and plays in real time; chat alongside, duration input above.
- AC-03 — chat refinement updates the graphic, appends the exchange, refreshes the preview.
- AC-04 — attach to a storyboard block stores a frozen code+duration snapshot; shown among block media.
- AC-05 — empty/too-short description is declined with a plain-language inline message (no broken preview).
- AC-06 — a generation that fails to run or fails the deterministic rule is marked not-usable; retry/refine offered (render-probe gate).
- AC-07 — graphics are private; non-owner access denied uniformly as not-found across every surface.
- AC-08 — only a ready, working graphic can be attached.
- AC-09 — deterministic-render rule blocks time/random-driven graphics from reaching ready.
- AC-10 — placed instances are frozen snapshots; later source refinements never alter them.
- AC-11 — server re-validates the cost estimate and refuses on mismatch.
- AC-12 — duplicate creates an independent copy seeded with the original's live, re-runnable chat + current code.
- AC-13 — the list shows only the Creator's own graphics (title + duration) with an empty state.
- AC-14 — a refinement that breaks keeps the last working version and records the failed attempt in chat.
- **Beyond spec (owner request):** the "AI Motion Graphics" page is a top-level nav peer to Projects/Storyboard/Generate AI; a generated graphic can be added to a **project** on `/editor` and renders in the project preview.
