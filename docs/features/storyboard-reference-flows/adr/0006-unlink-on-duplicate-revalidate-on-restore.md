---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0006 — Unlink reference blocks on draft duplication, re-validate links on checkpoint restore

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Block↔flow звʼязок 1:1 перетинається з двома існуючими механізмами: дублюванням драфта та checkpoint-восстановленням (storyboard-autosave-checkpoints). Що відбувається з копією блока та з відновленим канвасом, який посилається на пізніше видалений флоу? (spec §8 OQ-3, due before sdd:design).

## Decision drivers

- AC-12: видалений флоу → блок у no-flow state (стан уже визначений доменно).
- Spec §3 Non-goals: без крос-драфт переюзу персонажів (шеринг флоу між драфтами відкрив би його через чорний хід).
- Quality goal 3: цілісність лінків — жодних «висячих» посилань на чужі/відсутні флоу.

## Considered options

1. **Duplication unlinks + restore re-validates** — копії блоків входять у no-flow state; відновлення чекпоїнта ре-валідує block↔flow лінки й маркує відсутні флоу як no-flow.
2. **Duplication дублює флоу** — копія драфта тягне копії всіх reference flows: дорого (копіювання канвасів + файлових лінків), неочікувані дублікати в Generate AI списку.
3. **Duplication шерить флоу** — два драфти посилаються на один флоу: ламає 1:1-інваріант глосарію, відкриває крос-драфт переюз (non-goal), зірки стають спільним станом двох драфтів.

## Decision outcome

**Chosen:** Option 1. Єдиний варіант, що зберігає 1:1-інваріант і non-goal без дорогого копіювання; no-flow state уже існує доменно (AC-12) — переюз механіки замість нової.

## Consequences

**Positive**
- 1:1 block↔flow інваріант ніколи не порушується; no-flow state — єдина «деградована» механіка для всіх шляхів (delete, duplicate, restore).
- Жодного прихованого крос-драфт шерингу.

**Negative**
- Копія драфта втрачає референси — Creator має створити/перелінкувати їх вручну (прийнятна ціна: дублювання драфтів із готовим кастом — рідкісний кейс).

**Neutral**
- Чекпоїнт-відновлення лишається дешевим (валідація лінків — один SQL-запит по таблицях ADR-0005).

## Links

- Spec: [[../spec.md]] §8 OQ-3, AC-12
- SAD: [[../sad.md]] §4 (D4.7.3)
- Related ADR: [[0005-dedicated-sql-tables-for-curation-data]]
