---
id: T9
title: "Remove the principal-image step and components from the storyboard SPA"
layer: "ui"
deps: ["T6"]
acs: ["AC-08"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/"
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardGenerationFlow.ts"
  - "apps/web-editor/src/features/storyboard/api.ts"
  - "apps/web-editor/src/features/storyboard/types.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T9 — Зняти principal-крок зі storyboard SPA

## Why

US-07: один шлях готовності замість двох — [spec AC-08](../spec.md), [sad §4 п.1 + §6 Flow 5](../sad.md); контракт без principal-полів — [contracts/openapi.yaml](../contracts/openapi.yaml).

## What

У `apps/web-editor/src/features/storyboard/`:

- Видалити компоненти `PrincipalImageApprovalModal` (+ test), `PrincipalImagePreview`, `PrincipalImageLightbox` (+ styles), `PrincipalImageApprovalControls` та їх використання у `StoryboardPage.tsx` / `SceneBlockNode.mediaThumbnail.tsx` / `StoryboardPlanControls.tsx`.
- `hooks/useStoryboardGenerationFlow.ts`: флоу йде одразу до старту генерації, без approve/awaiting-станів.
- `api.ts` / `types.ts`: прибрати виклики 4 видалених endpoint-ів і `reference`-поле + дві principal-фази зі status-типу (синхронно з contract T6).

## Definition of Done

- [ ] У UI немає кроку approve/generate principal image; флоу генерації працює end-to-end без нього.
- [ ] Жодних звернень до `principal-image`-шляхів у web-editor (grep чистий).
- [ ] Наявні тести фічі (`StoryboardPage.plan.test.tsx`, `useStoryboardIllustrations.lifecycle.test.ts`, `__tests__/storyboard-api.test.ts`) оновлені й зелені (vitest з `apps/web-editor`).
- [ ] lint + typecheck чисті.

## Notes

**Видалення, не додавання** — нових компонентів тут нуль. Lane спільна з T10 (одна фіча-директорія) — серіалізовано через deps.
