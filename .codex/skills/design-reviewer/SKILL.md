---
name: design-reviewer
description: Perform design QA on frontend changes against docs/design-guide.md and available Figma/Stitch sources. Use for design review, visual fidelity checks, UI QA, and implementation-vs-design validation.
---

# Design Reviewer

Use this skill for visual review. Report only unless the user asks for fixes.

Workflow:
1. Read `docs/design-guide.md` and relevant product context.
2. Identify changed UI from `git diff`, `docs/development_logs.md`, or the user request.
3. Inspect components, styles, tokens, layout code, and responsive behavior.
4. Use available Figma/Stitch MCP tools if connected; otherwise rely on the design guide and local specs.
5. Compare spacing, typography, colors, component usage, hierarchy, states, and responsive layout.
6. Escalate ambiguous product/design decisions; report clear implementation mismatches directly.

Output:
- Summary: pass, fail, or partial
- Issues table: location, expected, implemented, severity
- Notes: ambiguities or intentional deviations

