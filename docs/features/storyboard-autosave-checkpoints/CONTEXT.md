---
status: Living
updated_at: "2026-06-04"
---

# Domain Context — storyboard-autosave-checkpoints

> Feature-local glossary. Roles and terms here are canonical for this feature's spec and downstream stages.

## Glossary

- **Autosave interval** — обраний Creator-ом проміжок часу між автоматичними checkpoint save (пресети 30 с / 1 хв / 2 хв / 5 хв / 10 хв, дефолт 1 хв), що зберігається в профілі користувача й діє на всіх його пристроях. NOT дебаунс lightweight autosave (той — фіксована внутрішня затримка злиття частих змін, не налаштовується).
- **Checkpoint countdown bar** — невеликий індикатор у верхньому правому куті сторінки storyboard, що показує час до наступного автоматичного checkpoint save; поруч із ним розташована кнопка Save. NOT індикатор стану «Saving…/Saved» lightweight autosave.
- **Checkpoint save** — збереження стану дошки зі знятим layout screenshot, яке створює History entry; запускається автоматично за autosave interval або вручну кнопкою Save. NOT lightweight autosave (той без скриншота й без запису в історію).
- **Creator** — the signed-in owner of a storyboard draft who edits it in the web editor's storyboard (Step 2). The only acting role for this feature. (Maps to the "Creator" actor in `docs/architecture-map.md`; storyboard drafts are owned per-user.) A signed-in user who is **not** the Creator of a given draft (a non-owner) has no access to that draft's saves, history, or settings effects.
- **History entry** — снапшот стану дошки, створений checkpoint save, який відображається в History-панелі та до якого Creator може відкотитися (Restore); зазвичай має прив'язаний layout screenshot, а при збої його зняття показується з SVG-мінімапою як аварійним прев'ю. NOT поточний стан дошки (його перезаписує lightweight autosave і він не має власного запису в історії).
- **Layout screenshot** — зменшене зображення полотна дошки, зняте в момент checkpoint save, що слугує візуальним прев'ю History entry. NOT SVG-мінімапа (згенерована схема блоків — лишається тільки як аварійний фолбек, коли зняття скриншота збоїло).
- **Lightweight autosave** — автоматичне збереження поточного стану дошки після будь-якої зміни, без layout screenshot і без створення History entry. NOT checkpoint save.
- **Storyboard draft** — the in-progress document a Creator builds through the generate wizard; holds the scene plan, scene blocks, attached illustrations, and music.

## Invariants

- A lightweight autosave can never create a History entry.
- The History panel always shows only History entries created by checkpoint saves; legacy pre-feature entries are never shown.
- A checkpoint save always produces a History entry — a failed layout-screenshot capture downgrades the preview to the minimap, it never drops the entry.
- The autosave interval always applies per Creator (account-wide), never per draft or per browser.

## Out of scope

- Timeline-editor (main video editor) autosave behaviour · this feature changes only the storyboard board page.
- Real-time collaborative editing semantics · storyboard drafts are single-Creator-owned in the current product.
