---
id: T13
title: "Add a Playwright e2e flow for the gate through the UI"
layer: "tests"
deps: ["T10", "T12"]
acs: ["AC-01", "AC-02", "AC-08"]
files_hint:
  - "apps/web-editor/e2e/"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T13 — Playwright e2e гейта через UI

## Why

Поверхня `web-frontend` додає e2e-through-UI рівень (surfaces-гейтинг); наскрізна перевірка US-01/US-02/US-07 очима Creator-а — [spec §4](../spec.md), [sad §6 Flow 1](../sad.md).

## What

Playwright-спека (стиль наявних `apps/web-editor/e2e/`):

1. Драфт із not-ready референсом → кнопка старту натиснута → видно відмову з **іменем** blocking-блока та діями (AC-02).
2. Референс завершено → повторний старт → генерація стартує, статуси сцен ідуть realtime (AC-01).
3. Упродовж усього флоу немає кроку principal image — ні модалки, ні approve (AC-08).

## Definition of Done

- [ ] Спека зелена у `npm run e2e` локально (повний stack: db, redis, api, web-editor, media-worker).
- [ ] Використано seed-користувача e2e та auth-кеш `.e2e-cache/` (обхід 15-хв rate-limit на логін).
- [ ] Без скріншот-залежних flaky-перевірок — асерти на текст/ролі.

## Notes

Генерацію провайдера в e2e стабом/фікстурою — реальні OpenAI-виклики в CI не робити. Прецедент сидингу — наявні e2e-спеки.
