---
id: T10
title: "useCheckpointScheduler: countdown, idle, deferral, overdue, double-save guard"
layer: "ui"
deps: ["T8", "T9"]
acs: ["AC-03", "AC-03b", "AC-03c", "AC-05", "AC-06", "AC-07", "AC-07b", "AC-11b"]
files_hint:
  - "apps/web-editor/src/features/storyboard/hooks/useCheckpointScheduler.ts"
owner: "Oleksii (solo dev)"
estimate: "L"
status: "todo"
---

# T10 — useCheckpointScheduler: countdown, idle, deferral, overdue, double-save guard

## Why

Серце фічі — клієнтський планувальник ([ADR-0002](../adr/0002-client-owned-checkpoint-scheduler.md)), що володіє всім розкладом checkpoint-ів. Потоки: [sad §6 Critical flow 1, «Прострочений checkpoint», «Життєвий цикл countdown», «Ручний Save»](../sad.md).

## What

Новий хук `useCheckpointScheduler.ts` (стан — за конвенцією external store / `useSyncExternalStore`, без нових залежностей):

- **Інтервал:** читає налаштування акаунта через `features/settings/api.ts` (T8); збій читання → сесійний дефолт 60 с, редагування не блокується (AC-11b); новий інтервал діє з наступного старту відліку (AC-09 client-side).
- **Countdown/idle:** відлік іде лише за наявності змін, новіших за останній checkpoint; без змін — idle «all saved», Save неактивна, нуль checkpoint-ів (AC-05); перша зміна після idle стартує свіжий повний відлік; скидання після кожного checkpoint-а (AC-06).
- **Деферал (лише автоматичний):** інтервал сплив під час drag/typing → відкласти до кінця взаємодії, кап один додатковий інтервал — на капі знімати як є (AC-03b).
- **Overdue:** `visibilitychange`/відкриття сторінки з простроченими змінами → один overdue-checkpoint ≤ 10 с, далі звичайний відлік (AC-03c).
- **Ручний trigger:** негайний, деферал не застосовується (AC-07); **double-save guard** — поки `inFlight` (T9), другий старт неможливий (AC-07b).

## Definition of Done

- [ ] Юніт-тести з fake timers, по одному на кожен AC із списку `acs`: інтервальний запуск; деферал + кап; overdue ≤ 10 с; idle без checkpoint-ів; reset відліку; manual без дефералу; guard при inFlight; fallback-інтервал при збої читання налаштувань
- [ ] Експонує стан для UI (T11): `remainingMs | idle | inFlight`, `canSaveNow`, `triggerManualSave()`
- [ ] Жодних таймерів, що тікають у фоні після unmount (cleanup-тест)
- [ ] lint + typecheck не гірші за базлайн

## Notes

Найбільша задача гілки (L, ~1 день). Сигнали drag/typing бере з існуючих canvas-хуків (`useStoryboardDrag`, текстові поля модалок) — лише читає, не змінює їх. Мульти-таб: last-writer-wins, без guard-ів (ADR-0002).
