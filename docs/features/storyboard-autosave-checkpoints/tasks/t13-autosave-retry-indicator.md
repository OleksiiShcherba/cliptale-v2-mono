---
id: T13
title: "Lightweight autosave: visible not-saved indicator + automatic retry"
layer: "ui"
deps: []
acs: ["AC-01b"]
files_hint:
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardAutosave.ts"
  - "apps/web-editor/src/features/storyboard/components/StoryboardPage.topBar.tsx"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T13 — Lightweight autosave: visible not-saved indicator + automatic retry

## Why

AC-01b вимагає: збій autosave → індикатор «останні зміни не збережені» + автоматичні повтори до успіху, редагування не блокується ([sad §6 «Lightweight autosave з автоматичним повтором»](../sad.md), §8 Error handling). Сьогодні хук НЕ ретраїть і не показує помилку (лише `console.error` — задокументовано в його хедері), тож sad §5 «useStoryboardAutosave.ts без змін» у цій частині неточний — зміна свідома (див. [_epic.md](./_epic.md) §Risks).

## What

- `useStoryboardAutosave.ts`: catch-гілка замість console-only — стан `error`/`unsaved` + автоматичний ретрай із backoff до успіху (наступна вдала спроба повертає `saved`); дебаунс 5 с і шлях `PUT /storyboards/:draftId` — без змін (AC-01: «today's autosave timing, unchanged»); ретрай повторює повний full-replace (контракт: naturally idempotent).
- `StoryboardPage.topBar.tsx`: існуючий статус-лейбл показує стан «не збережено» (новий стан у `AutosaveStatus`).

## Definition of Done

- [ ] Юніт-тести (fake timers, мокнутий apiClient): збій PUT → статус «не збережено», ретрай-цикл стартує без нової зміни користувача; успішний ретрай → «Saved»; редагування під час ретраю не блокується і не губить зміни
- [ ] Дебаунс-таймінг і payload-дедуп існуючих тестів не зламані
- [ ] topBar рендерить новий стан (компонентний тест)
- [ ] lint + typecheck не гірші за базлайн

## Notes

History entry тут не з'являється ніколи (AC-02) — задача не торкається history-шляху. Ділить `StoryboardPage.topBar.tsx` з T14 → одна lane.
