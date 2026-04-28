---
name: code-reviewer
description: >
  Reviews the most recently written code against the project's architecture rules defined in
  ./docs/architecture-rules.md, using ./docs/development_logs.md to identify what was last built.
  Use this skill whenever the user says things like "review my last code", "check if my code follows
  the rules", "audit the last implementation", "does my code follow the architecture?", "validate
  the last build", "check architecture compliance", or "review what was just written".
  Always trigger when the user asks anything about whether recent code matches or violates the
  project's architecture, conventions, or rules — even if phrased casually like "is the code ok?"
  or "did I follow the rules?". Processes one pending entry then stops — does not poll or wait.
---

# Code Reviewer Skill

Reviews the most recently implemented code against `./docs/architecture-rules.md`, using
`./docs/development_logs.md` to identify which files were last written.

---

## Step 1 — Preflight Checks & Polling Loop

Before doing anything else, check the following conditions:

| File | Role |
|---|---|
| `./docs/architecture-rules.md` | The rules to validate against |
| `./docs/development_logs.md` | The log that identifies what was last built |

**If `./docs/architecture-rules.md` is missing → STOP immediately** and tell the user:

> ⚠️ Missing: `./docs/architecture-rules.md`
> This file must define the architecture rules to validate against.

**For `./docs/development_logs.md`:**

1. Check if `./docs/development_logs.md` exists AND contains at least one line matching `checked by code-reviewer - NOT`.
2. **If either condition fails** (file missing OR no such line found) → **STOP** and tell the user:
   > ⏳ No pending review entries found in `./docs/development_logs.md`.
3. **Once a `checked by code-reviewer - NOT` line is found**, proceed to Step 2.

---

## Step 2 — Read Architecture Rules

Read `./docs/architecture-rules.md` in full.

Extract and internalize:
- Tech stack and allowed libraries/frameworks
- Folder structure and file placement conventions
- Naming conventions (files, functions, variables, components)
- Import style (absolute vs relative, barrel exports, etc.)
- Coding patterns to follow and anti-patterns to avoid
- Testing framework and test file placement rules
- Any other explicit rules or constraints

---

## Step 3 — Identify Pending Code from Development Logs

Read `./docs/development_logs.md` and find the log entry that contains the line `checked by code-reviewer - NOT`. If multiple entries have this marker, pick the **oldest** one (first occurrence in the file) to process first.

Extract from that entry:
- The task and subtask name
- The list of **files created or modified**
- A summary of what was implemented

Announce to the user:

> 🔍 Reviewing implementation: **[Subtask name]** (logged on [date])
> Files to review: `path/to/file1`, `path/to/file2`, ...

---

## Step 4 — Read the Code Files

Read each file listed in the log entry. If a file no longer exists, note it as missing but continue reviewing the others.

For each file, understand:
- Its purpose and what it implements
- Its location in the project
- How it imports and exports
- Its naming conventions
- Its structure and patterns used

---

## Step 5 — Run the Architecture Compliance Review

For each file, check it against every relevant rule in `architecture-rules.md`.

Organize violations and observations by category:

### Checklist to evaluate:

- [ ] **File placement** — Is the file in the correct folder per architecture rules?
- [ ] **Naming conventions** — File name, function names, variable names, component names all match the conventions?
- [ ] **Import style** — Are imports absolute/relative as required? Barrel exports used correctly?
- [ ] **Tech stack compliance** — Only allowed libraries/frameworks used? No forbidden dependencies?
- [ ] **Coding patterns** — Expected patterns followed? Anti-patterns avoided?
- [ ] **Code structure** — Functions/components structured as required? No hardcoded values that should be config/constants?
- [ ] **Tests** — Are test files present? Are they placed correctly? Do they follow naming conventions?
- [ ] **E2E coverage** — If the entry touches any `.tsx` UI component files, verify that at least one Playwright spec in `e2e/` covers the changed behaviour. Check by searching `e2e/*.spec.ts` for references to the changed component names or feature flow. If no E2E spec exists → **❌ Violation** (UI changes without E2E coverage are not approved).
- [ ] **Dead code** — No commented-out blocks or unused code?
- [ ] **Error handling** — Edge cases and errors handled per architecture expectations?

For each item, mark it as:
- ✅ **Pass** — compliant
- ⚠️ **Warning** — minor deviation, not a hard rule violation
- ❌ **Violation** — clear rule broken

---

## Step 6 — Produce the Review Report

Present a structured report to the user:

```
## 🏗️ Architecture Compliance Review
**Subtask reviewed:** [name]
**Date logged:** [date]
**Files reviewed:** [list]

---

### Summary
- ✅ Passing: X checks
- ⚠️ Warnings: Y items
- ❌ Violations: Z items

---

### Results by File

#### `path/to/file.ts`
- ✅ File placement: correct location per architecture rules
- ✅ Naming conventions: follows [convention name]
- ❌ Import style: uses relative imports but architecture requires absolute imports
  → Suggestion: change `import { X } from '../utils/x'` to `import { X } from '@/utils/x'`
- ⚠️ No error handling for [case] — consider adding per architecture guidelines

#### `path/to/file.test.ts`
- ✅ Test file placement: co-located correctly
- ✅ Naming: follows describe/it convention
- ⚠️ Missing edge case coverage for [scenario]

---

### Action Items
1. ❌ [Critical fix needed — file, rule violated, suggested fix]
2. ⚠️ [Optional improvement — file, what to improve]
```

---

## Step 7 — Update Development Log Entry

After completing the review, append comments to `./docs/development_logs.md` for the entry you just reviewed. **Never modify any existing content — only add new lines after the marker.**

- **If the code is FULLY COMPLIANT** (no violations, no warnings):
  - Add a new line immediately after `checked by code-reviewer - NO`: `checked by code-reviewer - OK`

- **If there are ANY issues** (❌ violations or ⚠️ warnings):
  - Add a new line immediately after `checked by code-reviewer - NO`: `checked by code-reviewer - COMMENTED`
  - Then add one line per issue, e.g.:
    ```
    checked by code-reviewer - COMMENTED
    > ❌ Import style violation in `src/auth/auth.service.ts`: uses relative imports, must use absolute (@/...)
    > ⚠️ Missing error handling in `src/auth/auth.service.ts` for token expiry
    ```
  - Keep each comment line concise (one line per issue).

Use the Edit tool to make this change in-place so no other log content is lost.

---

## Step 8 — Post-Write Sanity Check (Mandatory Full-File Gate)

After updating the log, scan the **entire** `./docs/development_logs.md` file for any remaining `- NOT` markers:

```bash
grep -n "checked by code-reviewer - NOT" ./docs/development_logs.md
```

- **If the grep returns no output** → the file is clean. Proceed to Step 9.
- **If any lines are found** — regardless of whether they belong to the entry just reviewed or a different one — handle each:
  - If it is the entry you just reviewed: you accidentally left the `- NOT` marker. Replace it immediately with `checked by code-reviewer - OK` or `checked by code-reviewer - COMMENTED` (whichever applies).
  - If it is a **different pending entry**: do NOT skip it. Loop back to Step 3 and review that entry before issuing the final verdict.

**Critical rule:** The skill must **never** issue the final verdict (Step 9) while any `checked by code-reviewer - NOT` line exists anywhere in `./docs/development_logs.md`. Leaving `- NOT` entries behind signals to developers that code is unreviewed — this blocks qa-reviewer and task-executor from proceeding. Every entry must be either `OK` or `COMMENTED` before this skill finishes.

Re-run the grep after all fixes to confirm **zero** `- NOT` lines remain in the entire file before continuing.

---

## Step 9 — Verdict & Summary

End with a clear verdict:

- **✅ COMPLIANT** — No violations or warnings.
- **⚠️ MOSTLY COMPLIANT** — Warnings only.
- **❌ NON-COMPLIANT** — One or more violations found.

Then report to the user:

> ✅ / ⚠️ / ❌ **[VERDICT]**
>
> Found X violation(s) and Y warning(s).
> Review comments have been added to `./docs/development_logs.md`.

If fully compliant, say:

> ✅ **COMPLIANT** — No issues found.

---

## Important Rules

- **Stop if nothing to review.** If `development_logs.md` is missing or has no `checked by code-reviewer - NOT` entry, stop immediately and tell the user.
- **Only review one pending entry at a time.** Pick the oldest `checked by code-reviewer - NOT` entry. Do not review already-reviewed entries.
- **Always update the log entry status** after review: `OK` if compliant, `COMMENTED` with inline notes if issues found.
- **Be specific, not vague.** Every violation must cite the exact rule from `architecture-rules.md` and the exact line/pattern in the file.
- **Don't invent rules.** Only flag things that are explicitly stated in `architecture-rules.md` or this skill file. Do not apply personal preferences or general best practices unless they are in the rules file.
- **UI changes require E2E coverage.** Any entry that modifies `.tsx` component files MUST have corresponding Playwright E2E spec coverage. If missing, the entry is ❌ NON-COMPLIANT — mark as `COMMENTED` regardless of all other checks passing.
- **Missing files are noted but don't block the review** of files that do exist.
- **If architecture-rules.md is ambiguous** on a point, note it as a warning with a suggestion to clarify the rules, not as a violation.
- **Never touch `active_task.md`** — code-reviewer only writes to `development_logs.md`.
- **Never modify existing lines in `development_logs.md`** — only append the verdict and comment lines after the `checked by code-reviewer - NO` marker.
