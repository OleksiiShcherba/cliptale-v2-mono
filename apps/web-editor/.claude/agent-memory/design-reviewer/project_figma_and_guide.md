---
name: Figma file and design guide location
description: Figma file key, design guide and development log paths, and key Figma node IDs for the ClipTale editor
type: project
---

Design guide: `/home/oleksii/Work/ClipTale/cliptale.com-v2/docs/design-guide.md`
Development log: `/home/oleksii/Work/ClipTale/cliptale.com-v2/docs/development_logs.md`
Figma file key: `KwzjofZgWKvEQuz9bXzEYT`
Main Editor Desktop node: `13:2`

Note: Figma node `13:2` is a high-level wireframe only. Track header area (node `13:69`) still shows the old 64px label width; actual implementation uses 160px. The Figma does not have detail-level specs for individual track header controls (M/L/delete buttons) — fall back to design-guide.md tokens for those.

**Why:** The design guide is the primary token reference; Figma is layout/region reference only for the editor.
**How to apply:** When reviewing timeline/track components, use design-guide.md Section 3 tokens as authority. Figma is useful for region sizes and colors of the overall layout.
