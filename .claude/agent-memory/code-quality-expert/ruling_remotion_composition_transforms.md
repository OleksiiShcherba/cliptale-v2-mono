---
name: Architecture gray area — data transforms in Remotion compositions
description: Ruling on whether inline sort/filter logic in VideoComposition counts as forbidden business logic per §5; now resolved by extraction to utils
type: project
---

§5 says "NEVER in Remotion compositions" for business logic, which includes "data transformations". The developer resolved this by extracting sort/filter logic to `VideoComposition.utils.ts` (`prepareClipsForComposition`), which is a pure function co-located with the composition. This is the accepted pattern.

**Why:** The architecture rule was written with domain business logic in mind (validation, workflow decisions). Rendering-order computation that only makes sense in the context of compositing frames sits in a gray zone. Extracting it to a co-located utils module satisfies §5 without requiring it to live in a service.

**How to apply:** If sort/filter/transform logic is found inside a Remotion composition function body, flag as ⚠️ warning and suggest extraction to a co-located `*.utils.ts`. If it is already extracted to `*.utils.ts`, the §5 concern is resolved — do not flag it.
