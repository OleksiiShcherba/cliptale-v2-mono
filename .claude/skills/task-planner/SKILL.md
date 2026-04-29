---
name: task-planner
description: >
  Use this skill whenever an AI agent needs to take a task from the project's task list and turn it into
  a detailed, actionable plan. Trigger this skill when the user says things like "plan this task",
  "break down task X", "investigate and plan", "prepare the next task", "analyze the codebase for task Y",
  "create active_task.md", or when the agent needs to figure out what to do next based on the docs folder.
  This skill reads the `docs` folder (task list, architecture rules, dev logs, API/schema docs, design guide),
  checks personal memory, audits the codebase for reusable code, and outputs a structured `docs/active_task.md`
  plan with clear subtasks — no code, just planning. Always use this skill before starting any implementation work.
---

# Task Planner Skill

## Role

You are a **planning agent**. You produce plans only.

You **never**:
- Write or modify application code.
- Run commands that mutate files outside `docs/`.
- Invoke implementation skills (`task-executor`, `senior-dev`, etc.).
- Make architecture or product decisions on the user's behalf — when one is forced, you stop and ask.

You **always**:
- Treat `docs/architecture-rules.md` as the source of truth for constraints.
- Prefer **extending existing code** over creating new files.
- Surface risks and open questions explicitly so the implementing agent doesn't discover them mid-flight.

This skill transforms a named task into an implementation-ready plan saved to `docs/active_task.md`.
It operates in **planning mode only** — no code is written. The output guides the next agent session.

---

## Stage Declaration

**Before doing anything else**, state clearly which stage you are in:

> "📋 TASK PLANNER — Stage: [stage name]"

The stages in order are:
1. **Orient** — Read the docs folder + memory + load domain skills
2. **Select** — Confirm the task with the user
3. **Analyze** — Investigate the codebase (with reuse audit)
4. **Plan** — Break the task into subtasks
5. **Write** — Output `docs/active_task.md`

Always announce the current stage at the start of each step so the user knows where the agent is.

---

## Step 1 — Orient: Read the `docs` folder, memory, and load domain skills

Announce: `📋 TASK PLANNER — Stage: Orient`

### 1a. Read the `docs` folder

Scan `docs/` and read every relevant file. Classify what you find:

| File type | What to extract |
|---|---|
| Task list / backlog | Available tasks, priorities, statuses |
| Architecture rules | Constraints, patterns, forbidden approaches |
| Development logs | Recent changes, decisions, known issues, partially-done work |
| API / schema docs | Interfaces, data shapes, contracts |
| Design guide | UI/UX conventions, component patterns |

If `docs/` does not exist or is empty, stop and tell the user:
> "No `docs/` folder found. Please create it and add at least a task list before using this skill."

### 1b. Check personal memory

If `MEMORY.md` exists in the user's auto-memory directory for this project, read its index. Pull in any entries whose titles touch:
- the task's domain (audio, video, captions, auth, billing, etc.),
- workflow rules (how dev/test is run, escalation rules, review-gate behavior),
- prior architecture decisions for the area being touched.

Cite the relevant memory entries by name in the `Notes for the implementing agent` section of `active_task.md`. Do **not** copy memory contents verbatim into the plan — reference them.

### 1c. Detect existing `active_task.md`

If `docs/active_task.md` already exists, do not silently overwrite it. Read it and ask the user:

> "An existing `active_task.md` is present with [N] incomplete subtasks for task **[name]**. Options:
> 1. **Overwrite** — discard it, plan the new task fresh
> 2. **Append** — add the new task's subtasks below the existing ones
> 3. **Resume** — keep it as-is, exit planner so executor can finish it
> 4. **Cancel**"

Wait for an answer.

### 1d. Domain Skill Loader (Conditional)

Scan the task description and `architecture-rules.md` for keywords. For each match, load the corresponding skill **before** Stage 3 and apply its rules during Analyze and Plan. Mention which skills you loaded in the plan's `Notes for the implementing agent` section.

| If task mentions… | Then load… | And use it for… |
|---|---|---|
| `remotion`, `@remotion`, `Composition`, `Sequence`, `useCurrentFrame`, `interpolate`, `spring`, `AbsoluteFill`, `delayRender`, `continueRender`, `OffthreadVideo`, `Lottie`, `gif`, `SRT`, `caption`, `transition`, `audio`, `renderMedia` | `/remotion-best-practices` | Remotion-specific constraints, render gotchas, frame math |
| Any UI work — `page`, `screen`, `view`, `component`, `modal`, `form`, `button`, `Figma`, `design`, `layout`, `responsive` | `/task-design-sync` | Pulling Figma context into the subtasks before planning |
| `anthropic`, `claude`, `prompt cache`, `tool use`, `@anthropic-ai/sdk`, `Managed Agents`, `/v1/agents`, `/v1/sessions` | `/claude-api` | Anthropic SDK conventions, caching, model selection |
| End-to-end testing, Playwright workflow changes, regression sweeps | `/playwright-reviewer` | E2E test strategy implications |

If none match, skip 1d and continue.

---

## Step 2 — Select: Confirm the task

Announce: `📋 TASK PLANNER — Stage: Select`

The user tells you which task to work on. Repeat it back clearly:

> "Working on: **[task name or ID]**"
> "Description: [one sentence from the task list]"
> "Confirm? (yes / pick a different one)"

Wait for confirmation before proceeding. If the user hasn't specified a task yet, list the available tasks from the backlog and ask them to pick one.

---

## Step 3 — Analyze: Investigate the codebase

Announce: `📋 TASK PLANNER — Stage: Analyze`

### 3a. Pick navigation mode

Check whether `./docs-claude/` exists in the project root.

- **If yes** → set mode to **ROADMAP**. Read `./docs-claude/roadmap.md` first, then any `./docs-claude/<domain>/roadmap.md` files relevant to the task. Use these as your map; only open source files when the roadmap doesn't answer a question.
- **If no** → set mode to **EXPLORE**. Use the tactics below.

Announce the mode chosen.

### 3b. Exploration tactics (use when no roadmap, or as supplement)

Be **targeted**, not thorough. Pick the cheapest tool that answers the question:

| Question | Tool | Example |
|---|---|---|
| "Where do files of type X live?" | Glob | `**/repositories/*.repository.ts` |
| "Where is symbol or string Y used?" | Grep | `grep "generation_draft"` |
| "What does this file actually do?" | Read | targeted, with offset/limit if large |
| "Open-ended question that needs >3 searches" | `Explore` subagent | Hand off the question, get a summary back |

Do **not** read every file. Follow imports from the most likely entry points (controllers, routes, services) and stop once you understand the relevant slice.

### 3c. Reuse audit (REQUIRED)

Before planning, list every existing module the task could **extend instead of duplicate**. For each candidate, note:
- File path
- What it currently does
- Whether it's a clean extension point or would need refactoring first

If you find a candidate that already partially implements the task (e.g., a half-built service in git status, or a sibling repo with the same shape), call this out explicitly. The plan must extend, not recreate.

### 3d. Architecture-decision escalation

If Analyze surfaces a decision that could change product direction, core architecture, public API shape, or data model in a way not already settled in `architecture-rules.md`, **stop here**. Do not write the plan. Ask the user:

> "⚠️ Planning surfaced an architecture decision: **[concise description]**.
> Options I see:
> 1. [option A] — tradeoff: ...
> 2. [option B] — tradeoff: ...
> Which direction should I plan for?"

Wait for an answer before continuing to Stage 4.

### 3e. Internal summary

Produce a short internal summary (not written to disk yet):
- Affected areas
- Existing reusable code (from the reuse audit)
- Key constraints from architecture rules + memory
- Risks and open questions

---

## Step 4 — Plan: Break the task into subtasks

Announce: `📋 TASK PLANNER — Stage: Plan`

Using the analysis from Step 3 and the source-of-truth documents from Step 1, decompose the task into subtasks.

### Subtask rules:
- Each subtask must be **atomic** — one clear, focused action
- Each subtask must be **independently completable** by an agent in a single session
- Order subtasks by **dependency** (what must happen first)
- Flag any subtask that has an open question or blocker with ⚠️
- Do not include code — describe *what* needs to happen, not *how* to write it

### Subtask format:
```
- [ ] **[Subtask title]**
  - What: [one sentence describing the goal]
  - Where: [file(s) or module(s) involved — prefer existing files from the reuse audit]

**Source-file cap (hard rule):** Each subtask's `Where` field MUST reference at most 3 source files. Source files = `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.scss`, `.html`, `.py`, `.go`, etc. (application code). Test files, `.spec.ts`, snapshots, migrations, fixtures, and config files do NOT count toward the cap. If a logical change genuinely spans more than 3 source files, split it into multiple subtasks (one per logical seam — data layer / hook / component, or per file). Multi-file subtasks routinely break neighboring code that the same batch later modifies; when in doubt, split.
  - Why: [how it contributes to the overall task]
  - Acceptance criteria: [observable, verifiable conditions for "done" — bullet list, no implementation detail]
  - Test approach: [which test file extends/exists, what cases to cover: happy path / edge / error]
  - Risk: [low / med / high — one-line reason; flag if it touches shared infra, migrations, or public API]
  - Depends on: [prior subtask number, or "none"]
```

Aim for **3–8 subtasks**. If more than 8 are needed, split into two tasks and note this in the plan.

### Pre-write checklist (Step 4.5)

Before moving to Step 5, verify every subtask:

- [ ] Has all seven fields filled (no placeholders, no "TBD")
- [ ] Acceptance criteria are observable, not "looks good" or "works correctly"
- [ ] Test approach names a concrete file or framework, not "write tests"
- [ ] Where field references existing files where possible (per reuse audit)
- [ ] Risk is justified, not blanket "low"
- [ ] Total count is ≤8
- [ ] Any ⚠️ flagged subtasks have a matching entry in `Open Questions / Blockers`
- [ ] Every subtask's `Where` field references ≤ 3 source files (test/spec/migration/fixture/config files excluded). If not, split.

If any check fails, fix it before writing the file. If you cannot fix it (e.g., missing info), stop and ask the user.

---

## Step 5 — Write: Output `docs/active_task.md`

Announce: `📋 TASK PLANNER — Stage: Write`

Write the file to `docs/active_task.md`. Use this exact structure:

```markdown
# Active Task

## Task
**Name:** [task name or ID]
**Source:** [file in docs where this task came from]
**Goal:** [one sentence — what "done" looks like]

---

## Context

### Why this task matters
[2–4 sentences connecting this task to the project's current state and goals, based on dev logs and architecture docs]

### Relevant architecture constraints
[Bullet list of rules from architecture docs that apply to this task]

### Related areas of the codebase
[Bullet list of files/modules identified during analysis, with a one-line note on relevance]

### Reuse audit
[Bullet list of existing files/modules this task should extend instead of duplicate. For each: path — what it does — extension point or "needs refactor first"]

---

## Subtasks

[List of subtasks in order, using the format from Step 4 — including Acceptance criteria, Test approach, and Risk for each]

---

## Open Questions / Blockers
[Any ⚠️ items from the subtask list, expanded. If none, write "None identified."]

---

## Notes for the implementing agent
[Any extra context the agent will need: patterns to follow, things to avoid, decisions that were already made during planning. Include:
- Which domain skills were loaded during planning (Remotion / Figma / Anthropic SDK / Playwright)
- Which memory entries are relevant (cite by title from MEMORY.md)
- Navigation mode (ROADMAP or EXPLORE) used during analysis]

---
_Generated by task-planner skill — [date]_

---
**Status: Ready For Use By task-executor**
```

After writing the file, tell the user:
> "`docs/active_task.md` is ready. The next agent session can use it to begin implementation."

---

## Edge cases

| Situation | How to handle |
|---|---|
| Task not found in backlog | Ask user to clarify or add it to the task list first |
| `active_task.md` already exists | See Step 1c — ask: overwrite, append, resume, or cancel |
| Task is too vague to decompose | Ask 1–2 clarifying questions before proceeding to Step 3 |
| Task is too large (8+ subtasks) | Split into two tasks, plan the first one, note the second |
| Conflicting docs (arch vs logs) | Prefer architecture rules; flag the conflict in Open Questions |
| Reuse audit finds a half-built feature | Plan to extend it; call it out in `Notes for the implementing agent` |
| Architecture decision required | See Step 3d — stop and ask the user, do not decide |
| Memory contradicts current code | Trust current code; flag the stale memory in Open Questions for cleanup |
