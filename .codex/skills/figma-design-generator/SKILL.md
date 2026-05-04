---
name: figma-design-generator
description: Generate a structural Figma design system and screen skeletons from an app brief, PRD, epic list, or requirements document. Use only when design output is requested and a Figma-capable connector is available.
---

# Figma Design Generator

Use this skill when the user wants a Figma design generated from product documents.

Workflow:
1. Confirm a Figma-capable MCP/app tool is available in the Codex runtime. If not, report the missing connector and provide a Markdown design guide instead.
2. Parse the product brief, PRD, epic list, or task list.
3. Extract app purpose, personas, epics, key screens, brand hints, and platform targets.
4. Create a structural design system: palette, typography, spacing, radius, and base layout blocks.
5. Create screen skeletons for the main structurally distinct screens at mobile, tablet, and desktop breakpoints.
6. Write or update `docs/design-guide.md` with file links, node IDs, naming conventions, breakpoints, and implementation guidance.

Scope:
- Produce visual language and layout skeletons.
- Do not create detailed production mockups unless explicitly requested.

