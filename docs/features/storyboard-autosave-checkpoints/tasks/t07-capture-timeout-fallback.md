---
id: T7
title: "captureCanvasThumbnail: 5-second timeout with typed fallback result"
layer: "ui"
deps: []
acs: ["AC-04"]
files_hint:
  - "apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.ts"
owner: "Oleksii (solo dev)"
estimate: "S"
status: "todo"
---

# T7 — captureCanvasThumbnail: 5-second timeout with typed fallback result

## Why

NFR (spec §6): «a capture not finished within 5 s counts as failed → minimap fallback, the loader is dismissed, the checkpoint completes». Сьогоднішній util не має таймаута; інваріант sad §12 «checkpoint ніколи не губиться мовчки».

## What

Розширити існуючий `captureCanvasThumbnail.ts` (`html-to-image`, JPEG 320×180 q0.6 — без зміни формату): обгортка з 5-с таймаутом, що повертає типізований результат — `{ kind: 'screenshot', dataUrl }` або `{ kind: 'minimap' }` (зняття провалилось/не встигло) замість кидання/`null`. Жодних нових залежностей (sad §2).

## Definition of Done

- [ ] Юніт-тести (co-located, fake timers): успішне зняття → `screenshot` + dataUrl; reject → `minimap`; >5 с → `minimap`, проміс резолвиться не пізніше таймаута
- [ ] Існуючі споживачі util-а не зламані (поточні тести зелені)
- [ ] lint + typecheck не гірші за базлайн

## Notes

Чиста клієнтська задача без deps — стартує паралельно з міграціями. Результат `kind` мапиться 1:1 на контрактний `previewKind` (T9).
