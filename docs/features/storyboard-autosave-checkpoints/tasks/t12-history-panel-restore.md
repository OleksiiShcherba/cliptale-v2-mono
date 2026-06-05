---
id: T12
title: "History panel: previewKind rendering + pre-restore checkpoint before Restore"
layer: "ui"
deps: ["T9"]
acs: ["AC-08", "AC-12", "AC-04"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardHistoryPanel.tsx"
  - "apps/web-editor/src/features/storyboard/hooks/useHandleRestore.ts"
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardHistoryFetch.ts"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T12 — History panel: previewKind rendering + pre-restore checkpoint before Restore

## Why

US-05 (панель — лише checkpoint-и з прев'ю) + US-07 (безпечний Restore): [sad §6 «Відкриття History-панелі» і Critical flow 2](../sad.md); контракт `HistoryEntry.previewKind` — [openapi.yaml](../contracts/openapi.yaml).

## What

- `useStoryboardHistoryFetch.ts` / типи entry: додати `previewKind` (фільтр легасі вже зроблено сервером, T6 — фронт нічого не дофільтровує).
- `StoryboardHistoryPanel.tsx`: `previewKind === 'screenshot'` → рендер інлайн-зображення зі snapshot; `'minimap'` → існуючий `SnapshotMinimap` (reuse — компонент уже є).
- `useHandleRestore.ts`: перед застосуванням Restore, якщо є зміни новіші за останній History entry — pre-restore checkpoint через push-клієнт T9 (фолбек мінімапи за AC-04, **ніколи не блокує Restore** — збій pre-restore push-а не зупиняє відновлення); після застосування — lightweight-збереження відновленого стану (Critical flow 2).

## Definition of Done

- [ ] Компонентні тести панелі: entry зі `screenshot` → `<img>` з dataUrl; із `minimap` → `SnapshotMinimap`
- [ ] Тести restore-хука: зміни новіші за останній entry → спершу pre-restore push, потім apply; немає новіших змін → без зайвого checkpoint-а; збій pre-restore → Restore все одно застосовується
- [ ] Після pre-restore новий entry зверху списку (інвалідація кеша)
- [ ] lint + typecheck не гірші за базлайн

## Notes

`useStoryboardHistorySeed.ts` (сьогоднішнє сіювання початкового entry) — перевірити сумісність із checkpoint-only моделлю; якщо сід створює per-change-подібний запис, вирішити в T14 разом із прибиранням push-сайтів.
