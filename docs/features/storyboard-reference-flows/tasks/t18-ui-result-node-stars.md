---
id: T18
title: "Add star + primary-star controls to the flow ResultNode with block-preview sync"
layer: "ui"
deps: ["T14"]
acs: ["AC-06", "AC-07"]
files_hint:
  - "apps/web-editor/src/features/generate-ai-flow/components/ResultNode.tsx"
  - "apps/web-editor/src/features/generate-ai-flow/api.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T18 — UI: зірки на ResultNode

## Why

Механіка курації «star-to-promote» ([sad §6 Flows 2, 4](../sad.md)); зірки живуть на result-блоках існуючого флоу-канваса (spec §3 — без окремої галереї).

## What

**Reuse:** `ResultNode.tsx` (розширення), `flowNodeStyles.ts`, існуючий api-шар фічі. Контроли зʼявляються **лише** коли флоу лінкований до reference-блока (контекст з відповіді API, derived badge T12).

- Toggle зірки на результаті (`starReferenceResult`/`unstarReferenceResult`) — оптимістично, збіжність із сервером (комутативні toggle).
- Призначення primary (зірка-акцент); зняття primary → у UI видно fallback-стан.
- Зняття останньої зірки → блок на сторіборді у placeholder-стані (узгоджено з T15 через realtime-подію).

## Definition of Done

- [ ] Компонентні тести: toggle/primary рендеряться лише в reference-флоу; оптимістичне оновлення відкочується на помилці
- [ ] Тест: un-star primary → fallback відображення; un-star останньої → стан «без зірок»
- [ ] lint + typecheck не гірші за baseline

## Notes

Паралельна гілка з T15/T16. Не чіпати поведінку звичайних (не-reference) флоу.
