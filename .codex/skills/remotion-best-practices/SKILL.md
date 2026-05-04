---
name: remotion-best-practices
description: Apply Remotion best practices for React video compositions, media assets, timing, audio, captions, transitions, metadata, and rendering. Use for Remotion code, render-worker behavior, and video composition changes.
---

# Remotion Best Practices

Use this skill when touching Remotion compositions or rendering behavior.

Workflow:
1. Identify the relevant topic: assets, audio, captions, timing, sequencing, transitions, metadata, dimensions, fonts, images, video, FFmpeg, or testing.
2. Read the matching Claude reference rule from `.claude/skills/remotion-best-practices/rules/` if detailed guidance is needed.
3. Inspect existing composition patterns before editing.
4. Keep composition props schema-safe and deterministic.
5. Avoid browser-only assumptions in render-worker paths.
6. Validate with the project’s existing Remotion tests or render checks when practical.

Reference mapping:
- Detailed topic files remain in `.claude/skills/remotion-best-practices/rules/` and are safe to read as references.

