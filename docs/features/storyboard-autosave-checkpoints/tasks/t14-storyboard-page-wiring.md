---
id: T14
title: "Wire two-tier saving into StoryboardPage: mount scheduler/bar/overlay, remove per-change pushes"
layer: "wiring"
deps: ["T10", "T11", "T12", "T13"]
acs: ["AC-01", "AC-02", "AC-03", "AC-06"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardPage.topBar.tsx"
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardHistorySeed.ts"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T14 — Wire two-tier saving into StoryboardPage: mount scheduler/bar/overlay, remove per-change pushes

## Why

Композиція фічі: [sad §5](../sad.md) (нові хуки/компоненти живуть на сторінці дошки) + hard rule AC-02 — lightweight autosave ніколи не створює History entry, отже всі сьогоднішні per-change push-сайти мають зникнути.

## What

- `StoryboardPage.tsx`: змонтувати `useCheckpointScheduler` (T10), `CheckpointCountdownBar` у верхньому правому куті (AC-06) і `CheckpointCaptureOverlay` (AC-03); **прибрати всі виклики history-push на кожну зміну** — checkpoint push викликається лише планувальником/ручним Save/pre-restore.
- `useStoryboardAutosave` лишається єдиним per-change шляхом (AC-01 — таймінг незмінний); сигнали «є зміни новіші за останній checkpoint» виводяться зі стану збереження для планувальника.
- `useStoryboardHistorySeed.ts`: узгодити з checkpoint-only моделлю (сід або стає checkpoint-ом із мінімапою, або прибирається — рішення за фактичною роллю сіда; зафіксувати в коміті).

## Definition of Done

- [ ] Інтеграційний тест сторінки: N змін підряд → жодного history-push (AC-02), лише lightweight-збереження; checkpoint відбувається лише за інтервалом/Save
- [ ] Bar і overlay рендеряться у правильних місцях; існуючий індикатор «Saving…/Saved» працює поруч (AC-01)
- [ ] Жодного залишкового імпорту старого per-change push-патерну (grep чистий)
- [ ] Існуючі тести StoryboardPage зелені; lint + typecheck не гірші за базлайн

## Notes

Ділить topBar із T13 → одна lane (T13 раніше в DAG). Це останній «code»-вузол перед e2e — після нього фіча функціонально повна.
