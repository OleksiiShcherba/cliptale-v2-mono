---
id: T11
title: "CheckpointCountdownBar + CheckpointCaptureOverlay components"
layer: "ui"
deps: ["T10"]
acs: ["AC-03", "AC-05", "AC-06", "AC-07", "AC-07b"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/CheckpointCountdownBar.tsx"
  - "apps/web-editor/src/features/storyboard/components/CheckpointCountdownBar.styles.ts"
  - "apps/web-editor/src/features/storyboard/components/CheckpointCaptureOverlay.tsx"
  - "apps/web-editor/src/features/storyboard/components/CheckpointCaptureOverlay.styles.ts"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T11 — CheckpointCountdownBar + CheckpointCaptureOverlay components

## Why

Видима каденція checkpoint-ів (US-03) і full-screen loader на час зняття (AC-03) — компоненти [sad §5](../sad.md): `CheckpointCountdownBar` (верхній правий кут) + `CheckpointCaptureOverlay`.

## What

- `CheckpointCountdownBar.tsx`: рендерить стан планувальника (T10) — активний відлік до наступного автоматичного checkpoint-а; idle «all saved» замість відліку (AC-05); кнопка Save поруч — активна лише коли є незафіксовані зміни і немає checkpoint-а в польоті (AC-05/AC-07b), клік → `triggerManualSave()` (AC-07).
- `CheckpointCaptureOverlay.tsx`: full-screen loader, видимий на час capture (автоматичного й ручного — interview decision у spec §1); ціль NFR ≤ 1 с p95 — компонент легкий, без анімаційних затримок появи/зникнення.
- **Reuse:** інлайн `*.styles.ts` із токенами палітри карти §Frontend; існуючі shared-прімітиви (кнопка/спінер), нові — лише якщо прімітива немає.

## Definition of Done

- [ ] Компонентні тести: відлік рендериться і тікає; idle-стан без відліку + неактивна Save; Save активна при змінах → клік викликає trigger; Save неактивна при `inFlight`; overlay з'являється на capture і зникає після
- [ ] Стилі через co-located `*.styles.ts`; жодного дубля існуючого Button/спінера
- [ ] lint + typecheck не гірші за базлайн

## Notes

Не плутати з існуючим save indicator «Saving…/Saved» (sad §12: це різні елементи — той лишається для lightweight autosave). Монтування в StoryboardPage — T14.
