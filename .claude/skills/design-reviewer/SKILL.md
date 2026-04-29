---
name: design-reviewer
description: >
  Use this skill to perform design QA reviews on frontend code changes against the Figma design system.
  Triggers when the user says things like "review design", "check design", "design review", "run design QA",
  "check if frontend matches design", "design checker", or "design control". Also triggers automatically
  when development_logs.md contains a line "checked by design-reviewer - NOT", meaning a developer's changes
  have not yet been reviewed. Always use this skill when there are unreviewed entries in development_logs.md
  or when the user asks to validate that code matches the Figma design guide. When Figma itself is incomplete
  or outdated, this skill fixes it autonomously using design-guide.md and general_idea.md as authority —
  no manual Figma work needed. Requires Figma MCP and access to ./docs/design-guide.md,
  ./docs/development_logs.md, and ./docs/general_idea.md.
compatibility:
  required_mcp: Figma MCP (https://mcp.figma.com/mcp)
  required_files:
    - ./docs/design-guide.md
    - ./docs/development_logs.md
    - ./docs/general_idea.md (required only for Figma-level fixes)
---

# Design Reviewer Skill

Performs automated design QA by comparing the latest developer changes against `./docs/design-guide.md` and the live Figma file. Updates `development_logs.md` with the review result, and either leaves code-level comments (if fixes are needed) or marks the entry as approved.

---

## Step 1 — Preflight Checks

Verify the following files exist:

| File | Role |
|---|---|
| `./docs/design-guide.md` | Design rules, tokens, component specs, Figma node IDs |
| `./docs/development_logs.md` | Log of developer changes with review status lines |
| `./docs/general_idea.md` | Product vision, app concept, and intent — used to resolve Figma ambiguities |

**If `design-guide.md` or `development_logs.md` is missing → STOP.**

Tell the user which file is missing and what it should contain. Do not proceed.

`general_idea.md` is required only for Figma-level fixes (Step 7C). If it's missing and a Figma fix is needed, note it as a blocker at that step — do not stop the whole review.

---

## Step 2 — Scan development_logs.md for Pending Reviews

Read `./docs/development_logs.md` in full. Search for any log entry containing the exact line:

```
checked by design-reviewer - NOT
```

- If **no such line exists** → inform the user there are no pending design reviews and stop.
- If **one or more entries** contain this line → identify the **most recent** one (last in the file). That is the entry to review.

Extract from that log entry:
- **Task name** and **subtask description**
- **Files created or modified** (listed in "What was done")
- **Date** of the entry

---

## Step 3 — Read the Design Guide

Read `./docs/design-guide.md` in full.

Extract and internalize:
- Color tokens and palette
- Typography scale (font sizes, weights, line heights)
- Spacing system (base unit, token values)
- Border radius tokens
- Component specs (naming conventions, variants, expected structure)
- Breakpoint definitions (mobile / tablet / desktop widths)
- Any explicit rules or anti-patterns listed

---

## Step 4 — Fetch Figma Design Context

Using the Figma MCP, retrieve design context for the relevant screen(s) or component(s) affected by the developer's changes.

Use node IDs or file references from `design-guide.md` to target the right parts of the Figma file.

For each affected UI area, extract:
- Expected layout structure and spacing
- Colors (exact hex values or token references)
- Typography (font, size, weight, line-height)
- Component names and their variants/states
- Responsive behavior at each breakpoint

If `design-guide.md` doesn't have specific node IDs for the changed area, use `get_design_context` or `search_design_system` via Figma MCP to locate the closest matching component or screen.

---

## Step 5 — Review the Developer's Code Changes

Read every file listed as created or modified in the log entry.

For each file, check the following against the design guide and Figma context:

### Color Checklist
- [ ] All colors use design system tokens (no hardcoded hex values unless explicitly allowed)
- [ ] Primary, secondary, surface, and semantic colors match spec
- [ ] No unapproved color values

### Typography Checklist
- [ ] Font family matches spec
- [ ] Font sizes use the defined scale (no arbitrary values)
- [ ] Font weights correct per role (headings, body, labels)
- [ ] Line heights and letter spacing within spec

### Spacing Checklist
- [ ] Padding and margin values follow the 4px base unit grid
- [ ] Spacing tokens used consistently (no magic numbers)
- [ ] Component internal spacing matches Figma spec

### Component Structure Checklist
- [ ] Component names match the convention in design-guide.md
- [ ] Correct variants/states implemented (hover, active, disabled, error)
- [ ] Component hierarchy matches Figma structure
- [ ] No missing states or interactive behaviors

### Layout & Responsive Checklist
- [ ] Breakpoints match defined widths (mobile/tablet/desktop)
- [ ] Layout shifts correctly between breakpoints
- [ ] Mobile-first approach applied (no desktop-only assumptions)

### Accessibility Checklist
- [ ] Semantic HTML elements used appropriately
- [ ] Interactive elements have accessible labels
- [ ] Color contrast meets design spec

---

## Step 6 — Determine Review Outcome

Based on the review, decide:

### Case A: No Issues Found

Everything matches the design guide and Figma. The implementation is correct.

→ Go to **Step 7A** (mark as approved).

### Case B: Code-Level Issues Found

There are discrepancies that the developer must fix in code (e.g., wrong color, wrong spacing, missing component variant). These are **not** Figma changes — the design is correct, the code is wrong.

→ Go to **Step 7B** (leave comments, mark as COMMENTED).

### Case C: Figma-Level Issues Found

The Figma design itself is unclear, outdated, or missing details for the implemented feature (e.g. a screen exists in code but not in Figma, a component variant is missing, spacing or colors in Figma contradict the design guide, a new flow was built but no Figma frame covers it).

→ **Do not flag and wait.** Fix Figma directly — go to **Step 7C**, then re-evaluate the code against the updated Figma and continue to Step 7A or 7B as appropriate.

---

## Step 7A — Mark as Approved

Update `./docs/development_logs.md`:

Find the exact line in the reviewed entry:
```
checked by design-reviewer - NOT
```

Replace it with:
```
checked by design-reviewer - YES
```

Then add a brief review note immediately after it:
```
design-reviewer notes: Reviewed on [YYYY-MM-DD]. All checks passed. Code matches design guide and Figma spec.
```

Report to the user:
> ✅ **Design review passed** for: [Task / Subtask name]
> No issues found. All colors, typography, spacing, and components match the design guide.
> Log updated: `checked by design-reviewer - YES`

---

## Step 7B — Leave Comments and Mark as COMMENTED

For each issue found, prepare a structured comment block. Then update `./docs/development_logs.md`:

Find the exact line in the reviewed entry:
```
checked by design-reviewer - NOT
```

Replace it with:
```
checked by design-reviewer - COMMENTED
```

Immediately after, insert the comment block:

```markdown
design-reviewer comments ([YYYY-MM-DD]):
- [FILE: path/to/file.tsx, LINE: ~N] ISSUE: [description of what's wrong]. EXPECTED: [what the design guide / Figma specifies]. FIX: [specific change needed].
- [FILE: path/to/file.tsx, LINE: ~N] ISSUE: [description]. EXPECTED: [spec]. FIX: [fix].
```

Each comment must include:
- **File path** and approximate **line number** (or component name if line is unclear)
- **What is wrong** (e.g., "color is #FF0000 but should be the `error` token `#D32F2F`")
- **What is expected** (reference to design guide section or Figma node)
- **Specific fix** the developer should make

Report to the user:
> ⚠️ **Design review found issues** for: [Task / Subtask name]
>
> **Issues requiring developer fixes:**
> - [summarize each issue in plain language]
>
> Comments added to: `./docs/development_logs.md`
> Log updated: `checked by design-reviewer - COMMENTED`
>
> The developer should address these before this entry can be marked YES.

---

## Step 7C — Fix Figma Directly (Figma-Level Issues)

This step runs **before** Step 7A/7B when Case C is identified. Do not ask the user — fix it yourself.

### 7C-1: Read general_idea.md

Read `./docs/general_idea.md` in full to understand:
- The product's purpose and target user
- The intended UX and interaction model
- Visual tone and brand intent
- Any specific screens, flows, or components described

This context is your source of truth for design intent when Figma is incomplete or ambiguous.

### 7C-2: Identify What Needs Fixing in Figma

Categorize each Figma-level issue into one of:

| Issue Type | Example |
|---|---|
| **Missing frame/screen** | Developer built a new screen but no Figma frame exists for it |
| **Missing component variant** | Code uses a `disabled` button state that isn't in the Figma component |
| **Outdated values** | Figma uses an old color/spacing that contradicts design-guide.md |
| **Missing responsive frame** | Only mobile frame exists, tablet/desktop missing |
| **Structural mismatch** | Figma layout doesn't reflect what was agreed in design-guide.md |

### 7C-3: Apply Fixes via Figma MCP

For each issue, use the Figma MCP tools to make the correction directly in the Figma file. Base all design decisions on:
1. **`design-guide.md`** — exact tokens, component specs, naming conventions
2. **`general_idea.md`** — product intent, UX goals, visual tone
3. **Existing Figma patterns** — match the style, spacing, and structure already established in the file

**Fix strategies by issue type:**

- **Missing screen** → Create a new frame at the correct breakpoint size(s). Populate it with the correct layout, components, and content derived from general_idea.md and the developer's implementation. Name it following existing conventions.
- **Missing component variant** → Add the missing variant to the existing component in the Design System page. Match the styling rules from design-guide.md. Name it using the `ComponentName/Variant/State` convention.
- **Outdated values** → Update the node's fill, stroke, or text properties to match the current design-guide.md tokens.
- **Missing responsive frame** → Duplicate the existing frame and adapt the layout to the missing breakpoint per design-guide.md breakpoint rules.
- **Structural mismatch** → Adjust the Figma frame's auto-layout, spacing, or hierarchy to align with the design guide spec.

### 7C-4: Update design-guide.md if Needed

If you added new frames or components to Figma, update `./docs/design-guide.md` to include:
- New node IDs for any frames or components created
- Any new naming conventions introduced
- Notes on what was added and why

### 7C-5: Log the Figma Fix

Append a note to the log entry being reviewed (before the review status line):

```markdown
design-reviewer figma-fix ([YYYY-MM-DD]):
- FIXED: [description of what was missing or wrong in Figma]
- ACTION: [what was done — e.g., "Created missing Dashboard/Mobile frame with correct layout"]
- SOURCE: [what guided the fix — e.g., "design-guide.md color tokens + general_idea.md product intent"]
```

### 7C-6: Continue the Review

After all Figma fixes are applied, re-fetch the updated Figma context and continue evaluating the developer's code normally. Proceed to Step 7A or 7B based on what the code review finds.

Report to the user as part of the final summary:
> 🔧 **Figma updated:** [N] issue(s) fixed directly in Figma before completing the code review.
> - [brief list of what was fixed]

---

If more than one log entry had `checked by design-reviewer - NOT`, only review the **most recent** one per run.

After completing the review, inform the user:
> There are [N] additional entries pending review. Run the design reviewer again to process the next one.

---

## Important Rules

- **Never skip Step 2.** Always check development_logs.md for the `- NOT` line before doing anything else.
- **Fix Figma issues autonomously.** Never flag a Figma-level issue and wait — always resolve it in Step 7C using design-guide.md and general_idea.md as authority.
- **Never mark YES if any checklist item fails.** Partial passes are still COMMENTED.
- **Be specific in comments.** Vague feedback like "fix the color" is not acceptable. Always include the exact expected value and where it comes from.
- **Only comment on code-level issues.** Do not leave comments about product decisions, content, or business logic — only design token / component / layout violations.
- **Preserve the rest of the log entry.** Only change the review status line and add the relevant comment/fix/note blocks. Do not rewrite or delete anything else.
- **Edit in place, never append.** The line format is `checked by design-reviewer - <STATUS>` where STATUS is one of NOT / YES / COMMENTED. Change only the trailing token — never insert a new status line.
- **Stay faithful to design-guide.md.** When fixing Figma, never invent new tokens, patterns, or styles not already defined in the design guide. Extend only what exists.
