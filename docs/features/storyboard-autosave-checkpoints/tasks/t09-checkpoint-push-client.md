---
id: T9
title: "Rework useStoryboardHistoryPush into the checkpoint push client"
layer: "ui"
deps: ["T7"]
acs: ["AC-03", "AC-04"]
files_hint:
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardHistoryPush.ts"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T9 — Rework useStoryboardHistoryPush into the checkpoint push client

## Why

Checkpoint = скриншот + снапшот **одним запитом** ([ADR-0002](../adr/0002-client-owned-checkpoint-scheduler.md) — атомарність живить «checkpoint ніколи не губиться мовчки»); сьогоднішній push — fire-and-forget із помилкою лише в console ([sad §11, ризик 3](../sad.md)) і двофазним minimap-then-upgrade патерном, який зникає.

## What

Переробити `useStoryboardHistoryPush.ts`: один виклик = `captureCanvasThumbnail` (T7) → `POST /storyboards/:draftId/history` із `{ snapshot (+ інлайн dataUrl при скриншоті), previewKind }` за контрактом `CheckpointPush`. Прибрати show-minimap-then-upgrade двофазність. Збій POST → видимий стан помилки + ретрай (sad §11: «ретрай + видимий стан помилки checkpoint-а»); інвалідація TanStack Query-ключа history після успіху (sad §8). Експонувати стан `inFlight` — джерело double-save guard (T10/T11).

## Definition of Done

- [ ] Юніт-тести (мокнуті capture + apiClient): успішне зняття → body з `previewKind:'screenshot'` і dataUrl усередині snapshot; фолбек → `previewKind:'minimap'` без dataUrl, push однаково відбувається (AC-04)
- [ ] POST-збій → стан помилки видимий, ретрай приводить до успіху; жодного мовчазного `console.error`-only
- [ ] Після успіху history-кеш інвалідовано; `inFlight` коректно перемикається
- [ ] lint + typecheck не гірші за базлайн

## Notes

Інваріант: push НІКОЛИ не умовний від результату скриншота — лише `previewKind` змінюється. Виклики хука з StoryboardPage перепідключає T14.
