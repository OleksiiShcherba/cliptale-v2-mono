---
name: repo-navigator
description: Investigate the repository and create or update compact roadmap docs in docs-claude/ that map structure, domains, entry points, and main logic flows for future agents.
---

# Repo Navigator

Use this skill to create an agent-readable map of the codebase.

Workflow:
1. Detect stack, package manager, apps, packages, tests, and build tools.
2. Use `rg --files`, package manifests, configs, and entry points to map the repo.
3. Identify domains, ownership boundaries, core flows, shared utilities, and test locations.
4. Write a compact top-level roadmap to `docs-claude/roadmap.md`.
5. For large domains, write focused roadmaps under `docs-claude/<domain>/roadmap.md`.
6. Keep maps concise and navigational; do not duplicate full source documentation.

Do not refactor code while navigating.

