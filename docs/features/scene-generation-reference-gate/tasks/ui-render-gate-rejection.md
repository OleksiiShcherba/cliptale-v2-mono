---
id: T10
title: "Render the Reference-done gate rejection with named blocks and unlinked scenes"
layer: "ui"
deps: ["T9"]
acs: ["AC-02", "AC-03b", "AC-04b"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/"
  - "apps/web-editor/src/features/storyboard/hooks/"
  - "apps/web-editor/src/features/storyboard/api.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T10 — Рендер відмови Reference-done gate

## Why

Creator мусить дізнатися **які саме** референси завершити/повторити/видалити або які сцени злінкувати — [spec AC-02/AC-03b/AC-04b](../spec.md), 422-гілки — [contracts/openapi.yaml](../contracts/openapi.yaml), [sad §6 Flow 1/2 alt](../sad.md).

## What

- Обробка 422 від start/regenerate: `references.reference_gate_failed` → список named blocking-блоків (`details.blocks`) з підказкою finish / retry / remove через **наявні** reference-flow контроли (нових affordance не вводити — AC-02); `references.unlinked_scenes` → список named сцен (`details.scenes`) з підказкою link a reference.
- Per-scene регенерація показує лише блоки своєї сцени (AC-03b).

**Reuse (обов'язково):** компонувати з наявних `apps/web-editor/src/shared/components/` + co-located `*.styles.ts` (інлайн `CSSProperties`, токени-константи з наявних styles; палітра/типографіка — за `docs/design-guide.md`). Прецедент error-рендеру — наявні error-surface storyboard-фічі. Новий компонент — лише якщо жоден наявний примітив не підходить, у тому ж стилістичному підході.

## Definition of Done

- [ ] Компонентні тести: обидва 422-коди рендерять списки з іменами; дії ведуть до наявних reference-контролів; per-scene показує тільки блоки сцени.
- [ ] Жодної нової стилістичної системи / дубльованих примітивів.
- [ ] lint + typecheck чисті.

## Notes

Lane спільна з T9. Стан помилки — серверний (TanStack Query mutation error), без дублювання гейт-логіки на клієнті: SPA лише рендерить authoritative-відмову api (ADR-0002).
