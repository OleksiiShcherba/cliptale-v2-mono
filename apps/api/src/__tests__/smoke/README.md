# Smoke Tests

Smoke tests hit **real external APIs** and cost real money. They are skipped by
default. A developer running `pnpm --filter @cliptale/api test` without the
required env flag will see zero new test activity and zero new env requirements.

---

## What lives here

| File | What it tests |
|---|---|
| `fal-generation.smoke.test.ts` | One real round-trip to fal.ai per capability (text-to-image, image-edit, text-to-video, image-to-video) |

---

## How to run the fal.ai smoke suite

```bash
APP_FAL_SMOKE=1 APP_FAL_KEY=<real-key> \
  pnpm --filter @cliptale/api test \
  src/__tests__/smoke/fal-generation.smoke.test.ts
```

Replace `<real-key>` with a real fal.ai API key (never the stub value
`test-fal-key` used in unit tests — the suite will fail loudly if you pass the
stub).

---

## What each run submits

Each run makes **4 generation requests**, one per fal.ai capability:

1. **Text-to-image** — `fal-ai/nano-banana-2` — 0.5K PNG, 1 image
2. **Image edit** — `fal-ai/nano-banana-2/edit` — 0.5K PNG, 1 image, 1 reference image
3. **Text-to-video** — `fal-ai/kling-video/v2.5-turbo/pro/text-to-video` — 5 s, 16:9
4. **Image-to-video** — `fal-ai/pixverse/v6/image-to-video` — 5 s, 360p, 1 reference image

All settings are deliberately the **smallest/cheapest** available. Estimated
cost: **~$0.50–$2 per run** (subject to fal.ai's current pricing). Total wall
time: **up to ~10 minutes** (kling-video pro is the slowest model).

---

## Troubleshooting

**Test fails with `400 invalid field` or `422 Unprocessable Entity`**
The fal.ai schema for that model has drifted from
`packages/api-contracts/src/fal-models.ts`. Re-query the model via the fal.ai
MCP (`mcp__fal-ai__get_model_schema`) and update the catalog in a separate PR.
Do NOT silently patch the input in the smoke test — the catalog is the source
of truth.

**Test times out**
kling-video pro can legitimately take 8+ minutes under load. Increase the
per-test timeout constant at the top of the smoke file if needed, but first
verify fal.ai's status page for incidents.

**`APP_FAL_SMOKE=1 requires a real APP_FAL_KEY` error**
You ran with `APP_FAL_SMOKE=1` but either didn't set `APP_FAL_KEY` or left it
as the unit-test stub value `test-fal-key`. Export a real key before running.
