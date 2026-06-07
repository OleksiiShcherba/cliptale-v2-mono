---
id: T17
title: "Build the cast confirmation modal (review/edit entries, images, scene links, aggregate estimate) and replace the principal-image entry point"
layer: "ui"
deps: ["T13", "T16"]
acs: ["AC-01", "AC-01b", "AC-02", "AC-03"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.tsx"
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.test.tsx"
  - "apps/web-editor/src/features/storyboard/components/PrincipalImageApprovalModal.tsx"
  - "apps/web-editor/src/features/storyboard/components/PrincipalImageApprovalControls.tsx"
owner: "Oleksii"
estimate: "L"
status: "todo"
---

# T17 — UI: cast confirmation modal + заміна principal-image кроку

## Why

Єдина точка курації касту до будь-яких списань ([sad §6 Flow 1](../sad.md)); фіча **REPLACES** principal-image крок — його UI знімається (spec §1 ¶4, §3 — дані старих драфтів не чіпати).

## What

**Reuse:** `CostConfirmModal` (generate-ai-flow) — патерн кост-підтвердження; `SceneModal.*` — патерн форм; `SceneLinkSelector` (T16); shared-модалка/інпути. **Новий компонент:** `CastConfirmModal`.

- Entry point «старт reference-генерації» → `startCastExtraction` + realtime-прогрес `storyboard.cast_extraction.updated` (reattach через `getCastExtraction`).
- Proposal: записи (тип/імʼя/опис — редаговані in place), призначені зображення, scene links через `SceneLinkSelector`; overflow-повідомлення «решту можна додати вручну» (AC-02).
- Confirm: агрегатна оцінка (`aggregate_estimate_credits`) → `confirmCast`; нічого не списано до старту ранів.
- Драфт з існуючими блоками не бачить extraction-дії (AC-01b).
- Зняти `PrincipalImageApprovalModal` / `PrincipalImageApprovalControls` з нового шляху і повʼязані виклики (lightbox/preview лишаються, якщо їх використовують legacy-перегляди).

## Definition of Done

- [ ] Компонентні тести: прогрес екстракції; повна редагованість proposal; overflow-повідомлення; confirm шле відкоригований каст
- [ ] Тест: при існуючих блоках extraction-дія прихована
- [ ] Principal-image approval недосяжний з нового флоу; legacy-драфти не ламаються (їх дані недоторкані)
- [ ] lint + typecheck не гірші за baseline

## Notes

Найбільша UI-задача; якщо росте за день — відщепити зняття principal-image UI окремим PR у тій самій lane.
