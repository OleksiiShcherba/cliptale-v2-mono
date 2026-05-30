# CONTEXT — storyboard-status-block-actions

> Feature-local glossary. Roles and terms here are canonical for this feature's spec and downstream stages.

## Glossary

- **Creator** — the signed-in owner of a storyboard draft who edits it in the web editor's storyboard (Step 2). The only acting role for this feature. (Maps to the "Creator" actor in `docs/architecture-map.md`; storyboard drafts are owned per-user.) A signed-in user who is **not** the Creator of a given draft (a non-owner) has no access to that draft's status-menu actions.
- **Storyboard draft** — the in-progress document a Creator builds through the generate wizard; holds the scene plan, scene blocks, attached illustrations, and music.
- **Scene plan** — the AI-generated ordering of scenes (prompts, timing, references) that, when applied, becomes the scene blocks on the canvas.
- **Scene block** — a single scene on the storyboard canvas.
- **Illustration** — a generated image attached to a scene block.
- **Visual style reference** — the canonical "principal image" that sets the shared look before scene illustrations are generated; today previewed as a small thumbnail/"Ref" box.
- **Status block** — a compact panel in the top-left of the storyboard canvas reflecting generation status. Two are in scope: **"Generated scenes applied"** (scene-plan generation completed) and **"Illustrations ready"** (scene illustrations completed).
- **Completed status block** — a status block in its success/completed state ("Generated scenes applied" or "Illustrations ready"), as opposed to its in-progress or failed states which reuse the same panel with different copy.
- **Regenerate** — a status-block menu action that re-runs the underlying generation.
- **Hide** — a status-block menu action that removes that block from the canvas for the current session only.
- **Status menu** — the kebab (⋮) menu on a completed status block exposing Regenerate and Hide.
