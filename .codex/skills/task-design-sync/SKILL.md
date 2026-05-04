---
name: task-design-sync
description: Evaluate a developer task for design needs, sync it with available Figma/design references, and update the task file with design guidance for implementation.
---

# Task Design Sync

Use this skill when a task needs design readiness analysis.

Workflow:
1. Collect the task description, project description, design guidelines, and development rules.
2. Decide whether design is needed.
3. If no design is needed, add a concise `Design` section explaining why.
4. If design is needed, use available Figma/Stitch MCP tools to locate relevant frames and states.
5. If the design connector is unavailable, add TODO design references rather than inventing node IDs.
6. Update the task Markdown with design source links, affected components, required states, responsive notes, and implementation constraints.

Do not make product/design decisions silently when the task changes user flow or visual hierarchy.

