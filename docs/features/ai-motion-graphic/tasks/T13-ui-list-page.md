---
id: T13
title: "Motion Graphics list page — empty state, rename, duplicate actions"
layer: "ui"
deps: ["T4", "T10"]
acs: ["AC-01", "AC-12", "AC-13"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/components/"
  - "apps/web-editor/src/features/motion-graphic/hooks/"
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T13 — Motion Graphics list page

## Why

US-01: the Creator's home for finding, reopening, renaming, and duplicating graphics. Derives from [spec US-01/AC-13, US-08/AC-12](../spec.md) + [sad §6 flow 5](../sad.md).

## What

Build the `/motion-graphics` list in the feature slice: fetch owner graphics (TanStack Query, cursor-paged) and render cards with title + duration + status, newest-first, with an **empty state** when none (AC-13). Wire **rename** (PATCH `/{id}`) and **duplicate** (POST `/{id}/duplicate`, AC-12) actions; opening a card routes into the authoring view (T16/T17). Reuse the existing card/list styling tokens + the generate-wizard slice conventions.

## Definition of Done

- [ ] List shows only the caller's graphics with title + duration + status; empty state renders when none (AC-13)
- [ ] Rename updates the title in place (AC-01); duplicate creates a copy that appears in the list (AC-12)
- [ ] List load comfortably within the ≤400 ms NFR (server-served; no client over-fetch)
- [ ] Component/hook tests pass; lint + typecheck clean

## Notes

- Depends on T10 (CRUD endpoints) for data and T4 (slice + route).
- The duration **input** + chat live in the authoring view (T16/T17), not here; this is the gallery.
