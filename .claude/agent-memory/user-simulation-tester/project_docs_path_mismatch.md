---
name: Agent spec references doc paths that do not exist
description: Agent instructions reference general_ides.md/general_ideas.md and general_user_review.md but only general_idea.md exists in ./docs
type: project
---

The user-simulation-tester agent spec references three files for context/logging that do not exist in the repo as written:

- `./docs/general_ides.md` — missing
- `./docs/general_ideas.md` — missing
- `./docs/general_user_review.md` — missing

The closest actual file is `/home/oleksii/Work/ClipTale/cliptale.com-v2/docs/general_idea.md` (singular, no `s`).

**Why:** On 2026-04-18 I observed the mismatch while running precondition checks. The agent spec suggests creating `general_user_review.md` at repo root if none exists, but that creates a fork between the agent's assumed canon and the project's actual canon.

**How to apply:** On future runs, treat `./docs/general_idea.md` as the authoritative product-context file (not `general_ides.md` / `general_ideas.md`). For the review log, check both `./general_user_review.md` (repo root) and `./docs/general_user_review.md` before creating; prefer `./docs/` since that is where `development_logs.md` and other operational docs already live. Mention the path reconciliation to the user on the next human-interactive run.
