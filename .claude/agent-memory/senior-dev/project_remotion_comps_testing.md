---
name: remotion-comps testing setup
description: How to run tests in packages/remotion-comps after adding jsdom and @testing-library/react
type: project
---

packages/remotion-comps now has a vitest.config.ts with jsdom environment. Install per-package:

```bash
cd packages/remotion-comps && npm install --workspaces=false
./node_modules/.bin/vitest run
```

Remotion primitives (AbsoluteFill, Sequence, Video, Audio, getRemotionEnvironment) must be mocked via vi.mock('remotion', ...) in component tests — there is no Remotion Player context in unit tests.

**Why:** Remotion's runtime requires a Player context; mocking keeps composition logic tests fast and isolated without a browser Player.
