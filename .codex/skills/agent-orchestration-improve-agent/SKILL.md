---
name: agent-orchestration-improve-agent
description: Improve existing agent or skill prompts through failure analysis, targeted edits, and validation. Use when asked to optimize, debug, refactor, or strengthen agent behavior.
---

# Agent Orchestration Improve Agent

Use this skill to improve an existing agent or skill file.

Workflow:
1. Identify the target agent or skill and read its current definition.
2. Collect evidence: failure examples, user corrections, confusing instructions, stale tool names, output format problems, or repeated misses.
3. Classify the problem: trigger metadata, workflow ambiguity, missing constraints, excessive context, wrong tool assumptions, or poor validation.
4. Patch the smallest useful change.
5. Preserve useful local conventions and remove runtime-specific language that does not apply to Codex.
6. Validate by checking the file reads coherently and, when practical, testing it against a representative prompt.

Do not invent metrics or claim measured improvement without evidence.

