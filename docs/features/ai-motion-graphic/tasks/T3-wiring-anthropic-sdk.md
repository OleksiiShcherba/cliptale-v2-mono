---
id: T3
title: "Add @anthropic-ai/sdk dependency, APP_ANTHROPIC_API_KEY config, and a singleton client"
layer: "wiring"
deps: []
acs: []
files_hint:
  - "apps/api/package.json"
  - "apps/api/src/config.ts"
  - "apps/api/src/lib/anthropic.ts"
owner: "Tech Lead"
estimate: "S"
status: "todo"
---

# T3 — Anthropic SDK dependency + config + client singleton

## Why

The authoring proxy (T9) needs an Anthropic client; the repo has no `@anthropic-ai/sdk` today (only OpenAI in media-worker). Derives from [ADR-0002](../adr/0002-anthropic-claude-for-code-authoring.md) + [sad §2, §7](../sad.md).

## What

Add `@anthropic-ai/sdk` to `apps/api`. Declare `APP_ANTHROPIC_API_KEY` (and an authoring-model id defaulting to `claude-opus-4-8`) in `apps/api/src/config.ts`, Zod-validated alongside the existing `APP_*` vars. Add a module-singleton client (`apps/api/src/lib/anthropic.ts`) mirroring the existing singleton pattern (`pool`/`redis`/`s3`).

## Definition of Done

- [ ] `@anthropic-ai/sdk` added to `apps/api/package.json` (version aligned with the workspace)
- [ ] `APP_ANTHROPIC_API_KEY` is Zod-validated in `config.ts`; boot fails with a clear message when absent
- [ ] Authoring model id is a config value (default `claude-opus-4-8`) — swapping tiers is a one-line change (ADR-0002)
- [ ] A singleton `anthropic` client module exports a configured instance
- [ ] lint + vet clean

## Notes

- No streaming logic here — that is T9. This task only makes the client + config available.
- Keep the key out of any log line; `config.ts` is the only place env is read (convention).
