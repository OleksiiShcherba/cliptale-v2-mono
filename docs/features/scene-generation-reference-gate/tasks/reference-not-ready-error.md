---
id: T2
title: "Add ReferenceNotReadyError replacing StarGateFailedError in the error module"
layer: "domain"
deps: []
acs: ["AC-02", "AC-03b", "AC-04b"]
files_hint:
  - "apps/api/src/lib/errors.ts"
  - "apps/api/src/lib/errors.test.ts"
owner: "Oleksii"
estimate: "S"
status: "todo"
---

# T2 — ReferenceNotReadyError замість StarGateFailedError

## Why

Відмова гейта мусить називати blocking-блоки та unlinked-сцени структуровано — [spec AC-02/AC-03b/AC-04b](../spec.md), wire-форма помилки — [contracts/openapi.yaml `Error` + `BlockingBlock` + `UnlinkedScene`](../contracts/openapi.yaml), конвенція — [sad §8 Error handling](../sad.md).

## What

У `apps/api/src/lib/errors.ts` (типізовані error-класи → central handler):

- Додати `ReferenceNotReadyError` → HTTP 422, `code: "references.reference_gate_failed"` або `"references.unlinked_scenes"`, `details: { blocks?: [{blockId, name}], scenes?: [{blockId, name}] }`, людський `error`-меседж із діями (finish / retry / remove · link a reference).
- `StarGateFailedError` лишається до міграції call-sites (видаляється у T3/T4) — у цій задачі лише новий клас + серіалізація.

## Definition of Done

- [ ] Unit-тести: обидва коди серіалізуються в JSON, який валідний проти прикладів з openapi.yaml (`error` обов'язковий, `code` за патерном `module.error_name`, `details.blocks`/`details.scenes`).
- [ ] Central handler мапить клас на 422 без спеціальних кейсів у контролерах.
- [ ] lint + typecheck чисті.

## Notes

Envelope репо — `{ error }` + additive `{ code, details }` (brownfield-відхилення, успадковане від предка — шапка openapi.yaml). Не вводити SDD-конверт `{ code, message }`.
