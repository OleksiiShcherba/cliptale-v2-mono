---
name: figma-design-generator
description: >
  Use this skill whenever the user provides a business idea, project brief, PRD, epic list, task list, or any document describing a web or mobile app they want to build — and wants a Figma design created from it. Trigger on phrases like "create a design for", "make a Figma file", "design this app", "turn this into a UI", "generate screens for", "build a design from this doc", "create mobile-first design", or when the user uploads a requirements document and asks for UI/UX output. Also trigger when someone says "design the app based on these tasks/epics" or "I need a Figma file for this project". Always use this skill when Figma MCP is available and the user wants design output from a document — even if they don't say "skill" or "Figma" explicitly. Output is a structural style guide design: visual language + page layout skeletons, NOT detailed mockups with real content.
compatibility:
  required_mcp: Figma MCP (https://mcp.figma.com/mcp)
  required_tools: file reading (pdf/docx/md)
---

# Figma Design Generator

Transforms project documents (briefs, PRDs, epic/task lists) into a **structural style guide** Figma file — visual language + layout skeletons for each page — plus a Markdown guide for AI development agents.

> **Scope**: This skill produces structural designs, NOT detailed mockups.  
> - ✅ Color palette, typography, spacing system  
> - ✅ Page layout skeletons showing main regions and block structure  
> - ✅ Named placeholder blocks (e.g. "Hero Section", "Card Grid", "Sidebar Nav")  
> - ❌ No real text content, no copy, no business logic details  
> - ❌ No filled-in data tables, no form field logic, no icon sets  

---

## Overview of Output

1. **Figma File** containing:
   - Design system (colors, typography, spacing, core component shapes)
   - One structural layout skeleton per key screen, at all 3 breakpoints
   - Named block regions — labelled rectangles showing layout intent
   - Minimal annotations on layout regions (not on individual elements)

2. **`design-guide.md`** — a Markdown reference for AI agents, containing:
   - Figma file link + key node IDs
   - Component naming conventions
   - Breakpoint specs
   - How to query the Figma file via MCP

---

## Step 1 — Read and Parse the Input Document

Read the uploaded file using the appropriate method for its type (pdf, docx, md, txt).

Extract and structure the following:
- **App name** and one-line description
- **Core user personas** (if mentioned)
- **Epic list** — group features into named epics
- **Key screens** implied by each epic (infer if not explicit)
- **Brand hints** — any mentions of color, tone, style, industry
- **Platform targets** — confirm web app, mobile-first

If any of the above is missing or ambiguous, make a reasonable inference and note it. Do not ask the user to clarify unless something is critically undefined (e.g. no app concept at all).

---

## Step 2 — Define the Design System

Before creating any screens, establish the design system. Create a dedicated **"Design System"** page in Figma.

### 2a. Color Palette
Derive from brand hints in the document. If none, pick a professional palette appropriate to the industry. Define:
- `primary` — main brand color
- `primary-dark` / `primary-light` — variants
- `surface` — background (white or near-white)
- `surface-alt` — secondary background (subtle gray)
- `text-primary` — main text
- `text-secondary` — subdued text
- `border` — dividers and outlines
- `success` / `warning` / `error` — semantic colors

### 2b. Typography
Define a type scale using a single font family (default: Inter). Sizes:
- `display`: 32px / 700
- `heading-1`: 24px / 700
- `heading-2`: 20px / 600
- `heading-3`: 16px / 600
- `body`: 14px / 400
- `body-sm`: 12px / 400
- `label`: 12px / 500 uppercase
- `caption`: 11px / 400

### 2c. Spacing & Radius
- Base unit: 4px
- Common spacing tokens: 4, 8, 12, 16, 24, 32, 48, 64
- Border radius: `sm`=4px, `md`=8px, `lg`=16px, `full`=9999px

### 2d. Core Shape Library
On the Design System page, define a small set of **base shape styles** only — not interactive components with states. These are the visual building blocks used in layout skeletons:

| Shape | Purpose |
|-------|---------|
| `Block/Primary` | Main content area block (filled with `primary-light`) |
| `Block/Surface` | Card or panel block (filled with `surface-alt`) |
| `Block/Nav` | Navigation region (filled with `surface` + border) |
| `Block/Action` | Button-like CTA placeholder (filled with `primary`) |
| `Block/Input` | Form field placeholder (outlined, `border` color) |
| `Block/Image` | Image/media placeholder (gray fill + diagonal cross) |
| `Block/Text-lg` | Large text block placeholder (horizontal lines, 3 rows) |
| `Block/Text-sm` | Small text block placeholder (horizontal lines, 2 rows) |

Name with convention: `Block/Type` — e.g. `Block/Primary`, `Block/Nav`

These blocks are placed on layout skeleton frames to show structure without any real content.

---

## Step 3 — Plan the Screen Architecture

Identify the **main screens only** — not every sub-state or modal. Aim for 3–6 screens per epic. If an epic implies many screens, pick the most structurally distinct ones (e.g. a list view and a detail view are structurally different; two similar list views are not).

```
[Epic Name]
  ├── Screen 1 — [Screen Name]  ← structurally distinct
  ├── Screen 2 — [Screen Name]
  └── Screen 3 — [Screen Name]
```

Each epic becomes a **named page** in the Figma file.  
Each screen gets three frames: Mobile, Tablet, Desktop.

**Do not create screens for**: empty states, error states, loading states, confirmation dialogs — these are structural variants, not separate screens.

---

## Step 4 — Create Figma Pages and Frames

### Page structure in Figma:
```
Page 1: Cover
Page 2: Design System
Page 3: [Epic 1 Name]
Page 4: [Epic 2 Name]
...
Page N: Flow Diagrams
```

### Breakpoint frame sizes:

| Breakpoint | Width | Frame name suffix |
|------------|-------|-------------------|
| Mobile     | 390px | `/Mobile`         |
| Tablet     | 768px | `/Tablet`         |
| Desktop    | 1440px| `/Desktop`        |

Name frames: `[ScreenName]/Mobile`, `[ScreenName]/Tablet`, `[ScreenName]/Desktop`

### Cover page must include:
- App name
- Tagline / one-liner
- Date created
- Color palette preview
- List of pages/epics

---

## Step 5 — Design Each Screen as a Layout Skeleton

For every screen in the architecture, create all three breakpoint frames as **layout skeletons** — not detailed mockups.

### What a layout skeleton contains:
- Named rectangular blocks representing each major UI region
- Applied design system colors (blocks use the color tokens, not gray)
- Correct proportions and spacing (4px grid)
- Block labels in a consistent text style (e.g. "Hero Section", "Product Card Grid", "Sidebar Navigation")
- No real text content, no icons, no images — only named blocks

### Mobile-first layout rules:
- **Mobile (390px)**: Single column, full-width blocks, stack vertically. Bottom nav block at the bottom.
- **Tablet (768px)**: Introduce 2-column where appropriate. Top or side nav block.
- **Desktop (1440px)**: Multi-column. Sidebar nav block. Max content width ~1200px centered.

### Block labelling:
Each block rectangle must have:
- A label in `label` text style (12px/500, uppercase), positioned inside the block
- The label describes the region's role: e.g. `HEADER / NAV`, `HERO SECTION`, `CARD GRID`, `FILTERS SIDEBAR`, `FOOTER`
- Apply the matching `Block/Type` shape style from the Design System

### What NOT to include:
- Real copy or placeholder text ("Lorem ipsum")
- Actual icons or images
- Form validation logic or field-level detail
- Business data or content

### Annotation style (minimal):
Only annotate at the **region level**, not element level:
- Small grey label outside the frame
- Format: `→ [Region name]: [one sentence of layout intent]`
- Example: `→ Card Grid: 1-col mobile, 2-col tablet, 3-col desktop`

---

## Step 6 — Flow Diagrams Page (lightweight)

On the final "Flow Diagrams" page, create a simple screen-to-screen flow for each epic using:
- Small thumbnail-sized rectangles labelled with screen names (no detail inside)
- Arrows showing navigation sequence
- No decision diamonds or complex logic — keep it a linear flow map

This is a navigation map, not a UX flow chart.

---

## Step 7 — Generate the AI Agent Markdown Guide

After the Figma file is complete, retrieve the following via Figma MCP:
- File key / URL
- Node IDs for each page
- Node IDs for key components in the Design System

Then generate `design-guide.md` using the template in `references/design-guide-template.md`.

---

## Step 8 — Return to User

Present:
1. The Figma file link
2. The `design-guide.md` file (via `present_files`)
3. A brief summary:
   - Number of epics and screens designed
   - Design system overview (primary color, font)
   - How AI agents should use the guide

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Figma MCP unavailable | Inform user, output design-guide.md as a placeholder with TODOs where Figma node IDs would go |
| Document has no epics/tasks | Infer a likely screen architecture from the app description, note assumptions |
| Document is very sparse (1-2 sentences) | Ask user for more detail before proceeding |
| More than 8 epics | Group into logical clusters, max 8 Figma pages, note groupings |

---

## Reference Files

- `references/design-guide-template.md` — Template for the AI agent guide output
- `references/figma-mcp-queries.md` — Common Figma MCP queries Claude can use during this skill
