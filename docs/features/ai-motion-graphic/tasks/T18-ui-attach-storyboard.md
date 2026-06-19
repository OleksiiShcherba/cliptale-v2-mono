---
id: T18
title: "Attach-to-storyboard UI — block-media picker extension + motion_graphic media render"
layer: "ui"
deps: ["T12", "T14"]
acs: ["AC-04", "AC-08"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/"
  - "apps/web-editor/src/features/motion-graphic/"
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T18 — Attach-to-storyboard UI

## Why

US-07: a ready graphic becomes block media alongside image/video/audio. Derives from [spec US-07/AC-04/AC-08](../spec.md) + [sad §5 (reuse the block-media picker), §6 flow 2](../sad.md).

## What

Extend the storyboard block-media picker (reusing `SceneBlockNode` media-thumbnail conventions) so a Creator can pick one of their **ready** graphics and attach it — calling the attach endpoint (T12). Render the attached `motion_graphic` media among the block's media (via the runtime preview, T14). Surface the AC-08 refusal ("only a ready, working graphic can be added") on a `422 motion_graphic.not_ready`.

## Definition of Done

- [ ] The picker lists the Creator's graphics and attaches a ready one to a block (201 → appears among block media, AC-04)
- [ ] Attempting a non-ready graphic surfaces the `not_ready` message (AC-08)
- [ ] The attached motion_graphic renders in the block via the runtime preview
- [ ] Component tests pass; lint + typecheck clean

## Notes

- Reuse `SceneBlockNode` media-thumbnail + badge conventions (`MEDIA_TYPE_BADGE_LABELS`) — add a `motion_graphic` badge.
- The snapshot is frozen server-side (T12); the UI only triggers attach + renders the returned snapshot.
