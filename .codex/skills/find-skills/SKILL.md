---
name: find-skills
description: Help discover, choose, or install skills when the user asks whether a capability exists or how to extend Codex with a skill.
---

# Find Skills

Use this skill when the user is looking for a capability that may exist as a skill.

Workflow:
1. Check currently available skills in the session metadata.
2. Search local project skill directories such as `.codex/skills`, `.claude/skills`, and `$CODEX_HOME/skills` when relevant.
3. If a matching skill exists, explain what it does and when to use it.
4. If no matching skill exists, suggest creating one with the `skill-creator` workflow.
5. Do not install remote skills without user approval.

