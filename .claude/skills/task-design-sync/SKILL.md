---
name: task-design-sync
description: >
  Use this skill whenever a developer task, ticket, or user story needs to be evaluated for design requirements and synced with a Figma design file. Trigger when the user provides a task description alongside project context (design guidelines, dev rules, project description) and wants to know if design work is needed — and if so, have the relevant Figma frames duplicated and adjusted for that module, with the task file updated to include design references for AI developer agents. Trigger on phrases like "process this task", "check if this needs design", "sync task with Figma", "prepare task for dev", "update task with design refs", or when a user uploads/pastes a task and mentions design guidelines or a Figma file. Always use this skill when inputs include a task description + design guidelines, even if the user doesn't explicitly say "skill".
compatibility: "Requires Figma MCP (https://mcp.figma.com/mcp) and file reading tools (pdf/docx/md/txt)"
---

# Task Design Sync

Evaluates a developer task for design requirements, syncs relevant Figma frames for that module, and outputs an enriched task `.md` file with design references ready for AI developer agents.

---

## Inputs

The skill accepts a mix of pasted text and uploaded files. Collect and identify:

| Input | Description | Required |
|-------|-------------|----------|
| **Task description** | The specific ticket/task to process | ✅ |
| **Project description** | Overall app/product context | ✅ |
| **Design guidelines** | Brand rules, Figma file ID/URL, component conventions | ✅ |
| **Development rules** | Coding standards, architecture conventions | ✅ |

If any required input is missing, ask the user to provide it before proceeding.

---

## Step 1 — Parse All Inputs

Read all provided files and/or pasted content. Extract and structure:

### From task description:
- Task title and ID (if any)
- Task type (feature, bug, refactor, enhancement)
- Module or section of the app this task belongs to
- List of functional requirements / acceptance criteria
- Any explicit UI/UX mentions

### From project description:
- App name and purpose
- Key modules/sections of the app
- Platform (web, mobile, both)

### From design guidelines:
- **Figma file ID or URL** — extract this carefully; it is required for MCP access
- Design system rules (colors, typography, spacing, component naming)
- Any module-specific design notes

### From development rules:
- Folder/file naming conventions
- Component structure expectations
- Any design-to-code mapping rules

---

## Step 2 — Evaluate Design Need

Analyze the task description and determine whether this task requires design work.

### Design IS needed if the task involves any of the following:
- A new UI screen, page, or view
- A new UI component or widget
- Changes to existing layout, visual hierarchy, or user flow
- New user-facing interactions (modals, forms, drawers, etc.)
- A new module that has no existing Figma representation
- Explicit mention of UI, UX, interface, screen, or visual

### Design is NOT needed if the task is purely:
- Backend logic, API, or database work
- Refactoring with no visual change
- Bug fixes that don't affect UI
- Configuration, environment, or infra changes
- Documentation updates

### Decision output:

**If design is NOT needed:**
- Notify the user clearly, e.g.:
  > "Design is not required for this task. This task involves [reason — e.g. backend API changes only] and has no UI impact. Proceeding with the task file update to reflect this."
- Update the task `.md` file with a `## Design` section that explains why design is not needed (see Step 5 format)
- Stop here — do not proceed to Figma steps

**If design IS needed:**
- Note which UI module/section is affected
- Proceed to Step 3

---

## Step 3 — Access Figma Base File

Using the Figma MCP, access the base design file identified in the design guidelines.

```
Figma MCP actions to perform:
1. Get the file metadata to confirm access and list pages
2. Identify the page(s) most relevant to the module described in the task
3. List frames/components on that page to find the closest matching base design
```

### Matching logic:
- Match by module name (e.g. task mentions "user profile" → find "Profile" or "User" page/frame)
- If no exact match, find the closest structural match (e.g. a similar list/detail layout)
- If no reasonable match exists, note this and use the most generic layout frame as a base

### If Figma MCP is unavailable:
- Inform the user that Figma MCP is not connected
- Output the task `.md` with a `## Design` section containing TODOs where Figma references would go
- Stop here

---

## Step 4 — Identify Missing States & Create Them in Figma

This step runs **automatically** after Step 3. You must invoke the `figma-use` skill before making any `use_figma` calls.

### 4a. Gap analysis — what states are missing?

Compare the task requirements against what exists in the base Figma frames. For every UI component or flow in the task, check whether the following states have designs:

| State category | Examples to check for |
|---|---|
| **Status / lifecycle** | loading, processing, ready, error, empty, pending |
| **Interactivity** | hover, active/pressed, focus, disabled |
| **Data states** | empty list, single item, paginated/many items, skeleton/loading |
| **Upload / progress** | idle, drag-over/active, uploading with progress bar, success, error |
| **Responsive** | mobile variant if only desktop exists (or vice versa) |
| **Feedback** | toast/notification, inline validation error, confirmation |

List every gap found. If no gaps exist, skip to Step 4d.

### 4b. Load figma-use skill

**MANDATORY:** Invoke the `figma-use` skill before any `use_figma` call. Never call `use_figma` directly.

### 4c. Create missing states in Figma

For each gap identified in 4a, create the missing design using `use_figma`. Work **incrementally** — one `use_figma` call per logical unit (e.g. one call for status badges, one for empty state, one for active dropzone). Validate with `get_screenshot` after each call.

**Rules for all created nodes:**
- Use exact design system tokens from the guidelines (colors, spacing, typography, radius) — never arbitrary values
- All colors passed to the Plugin API must be in 0–1 range (not 0–255)
- Position new nodes to the right of the rightmost existing frame on the page (scan `figma.currentPage.children` for rightmost x+width)
- Use `await figma.setCurrentPageAsync(page)` to switch pages — never the sync setter
- Set `layoutSizingHorizontal/Vertical = 'FILL'` only **after** `parent.appendChild(child)`
- Load fonts with `await figma.loadFontAsync(...)` before any text operation
- Return all created/mutated node IDs from every `use_figma` call

**What to build for each common gap:**

*Status badge variants* — create a `ComponentSet` named `StatusBadge` with one `COMPONENT` per status value (e.g. `Status=ready`, `Status=processing`, `Status=error`, `Status=pending`). Each badge: `cornerRadius: 9999`, correct fill color, Inter Medium 12px white label. Position variants in a horizontal row inside the set (x offset per variant width + 16px gap).

*Empty state panel* — build a panel frame matching the real panel dimensions. Include: type-filter tabs at top, search bar, centered icon circle + "No [items] yet" heading (Inter Medium 14px, `text-primary`) + sub-copy (Inter Regular 12px, `text-secondary`), primary upload/action button pinned at bottom.

*Drag-drop zone active state* — copy the modal container frame, change the drop zone fill to `primary-light` at 35% opacity, stroke to `primary` (solid, 2px), `dashPattern: [8, 4]`, add "Drop files to upload" label and accepted formats hint.

*Card/item state variants* — create one row frame per status variant (ready, processing, error). Each row: thumbnail placeholder, filename text, status badge (from component set), metadata text. Use tinted thumbnail backgrounds matching the status color at low opacity.

*Skeleton/loading state* — create a frame matching the loaded component size. Replace text and image areas with rounded rectangles using `surface-elevated` fill. Apply a note annotation: "Implement as CSS animation pulse in code."

### 4d. Group all new additions in a Figma Section

After creating all missing nodes:
1. Create a `figma.createSection()` named `Task: [Task Title] — Missing States (task-design-sync)`
2. Move all newly created frames/components into the section using `section.appendChild(node)`
3. Re-position nodes inside the section for a clean layout (left column: panel/list states; right column: modal/card states; top row: component sets)
4. Resize the section to fit all content

### 4e. Annotate each addition

Each created frame must have a yellow annotation label placed above it:
- Frame: `cornerRadius: 4`, fill `{ r: 0.996, g: 0.847, b: 0.231 }` (yellow)
- Text: Inter Regular 11px, dark fill `{ r: 0.1, g: 0.1, b: 0.1 }`
- Format: `[#] ComponentName — State description`
- Example: `[1] StatusBadge — ready / processing / error / pending variants`

### 4f. Collect all references

Return and record:
- Section node ID
- Node ID and name of every frame/component created
- Screenshot of the completed section (via `get_screenshot`)

---

## Step 5 — Generate Updated Task Markdown File

Output a complete updated task `.md` file. Start from the original task content and append/enrich it with a `## Design` section.

### Output file structure:

```markdown
# [Task Title]

> **Task ID:** [ID if provided]
> **Module:** [Module name]
> **Type:** [Feature / Bug / Enhancement / etc.]

## Description

[Original task description — preserved as-is]

## Acceptance Criteria

[Original acceptance criteria — preserved as-is]

## Development Rules

[Summary of relevant dev rules that apply to this task]

---

## Design

### Design Required: [Yes / No]

[If No:]
> Design is not required for this task. [Explanation of why — e.g. "This task involves backend data processing only and introduces no changes to the user interface."]

[If Yes:]

### Figma File
- **File:** [Figma file name]
- **File URL:** [Figma file URL]

### Relevant Frames
| Frame Name | Breakpoint | Node ID | Direct Link |
|------------|------------|---------|-------------|
| [Frame name] | Mobile | [node_id] | [link] |
| [Frame name] | Desktop | [node_id] | [link] |

### Components Used
| Component | Figma Name | Node ID | Notes |
|-----------|------------|---------|-------|
| [e.g. Button] | Button/Primary/Default | [node_id] | Used for submit CTA |

### Missing States Added to Figma (Step 4 output)

> All additions are grouped in the Figma Section: **"Task: [Task Title] — Missing States (task-design-sync)"**

| Frame / Component | Node ID | Gap it fills |
|-------------------|---------|--------------|
| [e.g. StatusBadge component set] | [node_id] | Status variants were missing (only Ready existed) |
| [e.g. AssetBrowserPanel/Empty] | [node_id] | No empty state existed in original design |
| [e.g. UploadDropzone/Active] | [node_id] | No drag-over/active state existed |
| [e.g. AssetCard states] | [node_id] | No per-status card variants existed |

### Design Notes for Developer Agent
- [Key instruction 1 — e.g. "Use the existing frame `15:2` as the base; refer to the added section for missing states"]
- [Key instruction 2 — e.g. "StatusBadge component set `[node_id]` defines all 4 status colors — use these, not ad-hoc colors"]
- [Key instruction 3 — e.g. "Apply spacing tokens from design guidelines; base unit is 4px"]
- [Key instruction 4 — e.g. "Skeleton/loading state annotation in Figma notes it should be a CSS pulse animation in code"]

### How to Query Figma via MCP
To retrieve design context programmatically, use the Figma MCP with:
- File key: `[file_key]`
- Existing frames: `[comma-separated node IDs of original frames]`
- Missing states section: `[section node ID]`

Example MCP call intent: "Get node [node_id] from file [file_key] to inspect the missing states section."
```

---

## Step 6 — Return to User

Present:
1. A clear summary message:
   - Whether design was needed and why
   - Which existing Figma frames were referenced
   - Which missing states were identified and created (with node IDs)
   - Screenshot of the new Figma section
2. The updated task `.md` file (appended `## Design` section)
3. The Figma section node ID so the user can navigate directly

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Design guidelines don't contain a Figma file ID/URL | Ask user to provide it explicitly |
| Figma MCP unavailable | Notify user, output task `.md` with TODO placeholders in the Design section; skip Steps 3–4 |
| No matching frame found in Figma file | Use closest structural match; document the assumption in Design Notes |
| Task is ambiguous about UI involvement | Default to "design needed"; flag the ambiguity in the Design Notes section |
| Input files are missing | Ask user for the missing input before proceeding |
| `use_figma` call errors | Stop immediately; read the error; fix the script; retry. Do NOT retry the identical failing script. |
| Gap analysis finds no missing states | Skip Step 4c–4e; note "No missing states identified" in the Design section |
| `figma-use` skill not loaded before `use_figma` | Load it first — this is a hard prerequisite, never skip |

---

## Reference Files

- `references/task-md-template.md` — Blank template for the output task file
- `references/figma-annotation-guide.md` — Annotation conventions for adjusted frames
