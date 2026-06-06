---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0007 — Derive the draft-global style description from starred results at scene-generation time

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Сцени без лінкованих reference-блоків генеруються з власного промпта + однієї драфт-глобальної derived style description (AC-09). Scope зафіксований у clarify (2026-06-06): одна на драфт, fallback — скрипт. Відкритим був спосіб отримання (spec §8 OQ-4, due before sdd:design).

## Decision drivers

- AC-08b: драфт без блоків/зірок теж генерується — потрібен fallback без starred results.
- Мета фічі (spec §2): стиль сцен має слідувати за КУРОВАНИМИ зображеннями, не за випадковим промптом.
- Свіжість: Creator може перезіркувати результати між генераціями — опис не сміє «застигнути» на старому наборі.

## Considered options

1. **Зі starred results у момент генерації сцен** — scene generation master збирає поточний набір starred images і просить LLM скласти текстовий стиль-опис; fallback — опис зі скрипта, коли зірок немає.
2. **Зі скрипта один раз при підтвердженні касту** — дешевше (один виклик), але опис ігнорує реальні куровані зображення й застаріває відносно ітерацій Creator-а.

## Decision outcome

**Chosen:** Option 1. Стиль-опис віддзеркалює актуальний курований стан драфта на момент кожної генерації; fallback зі скрипта покриває AC-08b (нуль блоків/зірок).

## Consequences

**Positive**
- Нелінковані сцени стилістично узгоджені з курованими референсами (мета фічі).
- Перезіркування автоматично оновлює стиль наступної генерації.

**Negative**
- +1 LLM-виклик на запуск повного набору сцен (один на драфт-генерацію, не на сцену) — маржинальна вартість.

**Neutral**
- Опис — внутрішній артефакт scene generation master; не зберігається як user-facing дані.

## Links

- Spec: [[../spec.md]] §8 OQ-4, AC-08b, AC-09
- SAD: [[../sad.md]] §4 (D4.7.4)
- Related ADR: [[0008-primary-star-topped-up-to-model-capacity]]
