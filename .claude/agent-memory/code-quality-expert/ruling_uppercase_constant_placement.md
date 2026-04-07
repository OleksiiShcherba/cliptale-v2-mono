---
name: Recurring violation — UPPER_SNAKE_CASE constants declared inside function bodies
description: Dev occasionally places UPPER_SNAKE_CASE named constants inside component/hook function bodies instead of at module scope
type: project
---

Dev has placed `UPPER_SNAKE_CASE` constants inside component function bodies (e.g. `const SCROLL_OVERRUN_PX = 300` inside `TimelinePanel` function body, seen in 2026-04-06 review). Architecture-rules.md §9 states: "Constants: `UPPER_SNAKE_CASE` for module-level constants."

**Why:** An `UPPER_SNAKE_CASE` name signals a module-level constant — declaring it inside a function recreates it on every render and makes it unreachable from tests or other modules.

**How to apply:** Whenever an `UPPER_SNAKE_CASE` `const` is found inside a function or component body, flag as ❌ violation per §9 and require it be moved above the function declaration at module scope.
