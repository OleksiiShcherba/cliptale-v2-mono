---
name: playwright-reviewer
description: >
  Runs real end-to-end UI tests using Playwright to visually verify features implemented in the project.
  Takes real browser screenshots, analyzes them against expected behavior from ./docs/development_logs.md,
  and updates the "checked by playwright-reviewer" field to YES (working) or COMMENTED (broken).
  Use this skill whenever the user says things like "run playwright review", "test the UI", "verify the features",
  "check what was built", "playwright check", "QA the implementation", "visual review", "e2e test",
  "screenshot test", or "confirm the feature works". Also trigger when the user says "mark features as tested",
  "update the dev logs with test results", or asks if something is working after implementation.
  Always use this skill when a project has ./docs/development_logs.md with unchecked playwright entries.
compatibility:
  required_files:
    - ./docs/development_logs.md
---

# Playwright Reviewer Skill

Performs real browser-based visual QA against features logged in `./docs/development_logs.md`.
Takes screenshots, analyzes them with Claude Vision, and updates the log with test results.

---

## Step 1 — Preflight Checks

Verify the environment before doing anything:

### 1a. Check required files
```bash
cat ./docs/development_logs.md
```

If `development_logs.md` is missing → **STOP** and tell the user to run the task-executor skill first to generate implementation logs.

### 1b. Detect project type and dev server

```bash
# Check package.json for framework and scripts
cat package.json 2>/dev/null | head -60

# Check for common config files
ls vite.config.* next.config.* nuxt.config.* astro.config.* 2>/dev/null
```

### 1c. Install Playwright if not present

```bash
# Check if playwright is installed
npx playwright --version 2>/dev/null || echo "NOT_INSTALLED"
```

If not installed:
```bash
npm install --save-dev @playwright/test
npx playwright install chromium --with-deps
```

### 1d. Find or detect the app URL

Look for the dev server URL in:
- `package.json` scripts (e.g., `"dev": "vite --port 3000"`)
- `vite.config.*`, `next.config.*`, etc.
- Ask the user if not determinable

Default fallback: `http://localhost:3000`

---

## Step 2 — Parse development_logs.md for Unchecked Features

Read `./docs/development_logs.md` and extract all entries where:
```
checked by playwright-reviewer: NOT
```

For each unchecked entry, extract:
- **Feature name / task name**
- **What was done** (bullet points describing what was implemented)
- **Files created/modified** (to understand what routes/components exist)
- **Date**

Build a test plan: one test scenario per unchecked log entry.

> If ALL entries are already marked YES or COMMENTED → inform the user everything is already reviewed and exit.

### Mandatory E2E coverage check (do this before writing any test)

For every unchecked entry, identify every UI change (new component, removed element, new button, new modal, changed interaction, visual difference). Then check `./e2e/` for an existing `.spec.ts` that covers each change:

- If a covering spec exists → run it, capture screenshots, verify it passes.
- If **no covering spec exists for a UI change** → **write one** in `./e2e/<feature-slug>.spec.ts` (or extend the nearest existing spec), run it, capture screenshots, verify it passes. Only then may you mark `YES`.
- If you cannot write or run the spec (environment issue, auth blocker, etc.) → mark `COMMENTED` and list exactly which scenarios are missing.

**Unit tests and integration tests do NOT count as E2E coverage for UI features.** A jsdom component mount that checks prop values does not confirm the feature works in a real browser. Only a Playwright scenario that navigates to the live app, performs the interaction, and captures a screenshot counts.

---

## Step 3 — Start the Dev Server

```bash
# Start dev server in background
npm run dev &
DEV_PID=$!
echo "Dev server PID: $DEV_PID"

# Wait for server to be ready (up to 30s)
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|301\|302" && echo "Server ready" && break
  sleep 1
done
```

> **Note:** Use the correct port detected in Step 1d. If the server is already running, skip this step.

---

## Step 4 — Write and Run Playwright Test Script

For each unchecked feature, generate a Playwright test that:
1. Navigates to the relevant route/page
2. Waits for the page to be stable
3. Takes a **full-page screenshot**
4. Takes **element-level screenshots** for specific components if relevant
5. Performs basic interactions (click, type, hover) matching what was implemented

### Script template: `./playwright-review-temp.js`

```javascript
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = './playwright-screenshots';
const PERSISTENT_DIR = './docs/test_screenshots';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(PERSISTENT_DIR, { recursive: true });

function makeScreenshotName(testName, label) {
  // Extract two words from the test name (e.g. "asset-upload", "clip-timeline")
  const words = testName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).join('-');
  const suffix = label ? `-${label}` : '';
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join('-');
  return `${words}${suffix}_${time}.png`;
}

const tests = [
  // GENERATED PER FEATURE — see Step 4a below
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const results = [];

  for (const test of tests) {
    console.log(`\nRunning: ${test.name}`);
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}${test.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000); // settle animations

      // Full page screenshot
      const screenshotPath = path.join(SCREENSHOT_DIR, `${test.id}-full.png`);
      const persistentPath = path.join(PERSISTENT_DIR, makeScreenshotName(test.name, 'full'));
      await page.screenshot({ path: screenshotPath, fullPage: true });
      fs.copyFileSync(screenshotPath, persistentPath);
      console.log(`  Screenshot saved: ${screenshotPath}`);
      console.log(`  Persistent copy: ${persistentPath}`);

      // Run any interactions
      if (test.actions) {
        for (const action of test.actions) {
          await performAction(page, action, SCREENSHOT_DIR, test.id, test.name);
        }
      }

      results.push({ id: test.id, name: test.name, status: 'captured', screenshots: [screenshotPath] });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ id: test.id, name: test.name, status: 'error', error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  fs.writeFileSync('./playwright-results.json', JSON.stringify(results, null, 2));
  console.log('\nDone. Results: ./playwright-results.json');
})();

async function performAction(page, action, dir, testId, testName) {
  if (action.type === 'click') {
    await page.locator(action.selector).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  } else if (action.type === 'fill') {
    await page.locator(action.selector).fill(action.value, { timeout: 5000 }).catch(() => {});
  } else if (action.type === 'screenshot') {
    const tmpPath = path.join(dir, `${testId}-${action.label}.png`);
    await page.screenshot({ path: tmpPath, fullPage: false });
    const persistentPath = path.join(PERSISTENT_DIR, makeScreenshotName(testName, action.label));
    fs.copyFileSync(tmpPath, persistentPath);
  }
}
```

### Step 4a — Generate test cases from the log entries

For each feature entry parsed in Step 2, produce a test object like:

```javascript
{
  id: 'feature-slug-YYYYMMDD',
  name: 'Feature name from log',
  path: '/inferred-route',         // infer from files modified or feature name
  actions: [
    { type: 'screenshot', label: 'initial' },
    // add interactions based on what was implemented
  ]
}
```

**Route inference rules:**
- If files modified include `pages/dashboard.*` → path = `/dashboard`
- If files modified include `pages/index.*` or `app/page.*` → path = `/`
- If files modified include `components/` only → path = `/` (root, component likely mounted there)
- If route is ambiguous → navigate to `/` and then attempt to locate the component

Write the generated script to `./playwright-review-temp.js`, then run:

```bash
APP_URL=http://localhost:3000 node ./playwright-review-temp.js
```

---

## Step 5 — Visual Analysis with Claude Vision

After screenshots are captured, analyze **each screenshot** using your built-in vision capability.

For each feature test, load the screenshot(s) and evaluate:

### Analysis checklist per feature:

1. **Does the page/component render at all?** (no blank screen, no error boundaries)
2. **Does it match what was described in "What was done"?**
   - If a button was added — is it visible?
   - If a form was added — are the fields present?
   - If a list/table was added — does it show data or a proper empty state?
   - If a modal was added — does it open after the trigger action?
3. **Are there visible JS errors or crash states?** (look for error boundaries, white screens, stack traces)
4. **Is the layout broken?** (overflow, misalignment, clipped content)
5. **Does the UI match design expectations?** (rough styling check — not pixel-perfect)

### Decision matrix:

| Observation | Result |
|---|---|
| Feature renders correctly, matches description | `YES` |
| Feature renders but has minor visual glitches | `YES` (note glitches in comment) |
| Feature partially renders or has broken interactions | `COMMENTED` |
| Page crashes, JS error visible, feature not found | `COMMENTED` |
| Screenshot shows completely different page | `COMMENTED` |

---

## Step 6 — Update development_logs.md

For each tested feature, update the corresponding entry in `./docs/development_logs.md`.

### Find the entry

Look for the log section matching the feature. The playwright field format to update is:

```markdown
checked by playwright-reviewer: NOT
```

### Update rules:

**If feature works → replace with:**
```markdown
checked by playwright-reviewer: YES
```

**If feature is broken → replace with:**
```markdown
checked by playwright-reviewer: COMMENTED — [one-line reason, e.g. "button not found on /dashboard", "page crashes on load", "modal does not open after click"]
```

Use `str_replace` for targeted, precise edits — **never rewrite the whole file**.

### Example str_replace:
```
old: "checked by playwright-reviewer: NOT"
new: "checked by playwright-reviewer: YES"
```

> If multiple entries have `NOT`, process each one individually with its own str_replace.

---

## Step 7 — Cleanup

```bash
# Remove temp test file and working screenshots (persistent copies in ./docs/test_screenshots are kept)
rm -f ./playwright-review-temp.js
rm -f ./playwright-results.json
rm -rf ./playwright-screenshots

# Kill dev server if we started it
kill $DEV_PID 2>/dev/null || true
```

> `./docs/test_screenshots/` is **never deleted** — it is the permanent visual record of every test run.

---

## Step 8 — Report to User

Present a clear summary:

```
✅ Playwright Review Complete

Tested: X features
├── ✅ YES (working): N
└── ❌ COMMENTED (broken): M

Results:
- [Feature name] → YES
- [Feature name] → COMMENTED — [reason]

./docs/development_logs.md has been updated.
```

If any features were COMMENTED, suggest next steps:
> "Feature '[name]' appears broken. Check the browser console or inspect `[file]` for issues."

---

## Important Rules

- **Never skip screenshot capture.** Visual confirmation is mandatory — do not mark YES without a screenshot.
- **Never rewrite `development_logs.md` wholesale.** Use `str_replace` for surgical edits only.
- **Never mark YES based on code inspection alone.** The browser must render it; the screenshot must confirm it.
- **Always clean up temp files** after the review run.
- **If the dev server fails to start** → STOP and tell the user to start it manually, then re-run the skill.
- **If Playwright cannot be installed** (e.g., network restrictions) → STOP and tell the user.
- **One feature = one test.** Do not batch features into a single test function — keep them isolated.

---

## development_logs.md Expected Format

The skill expects log entries in the format produced by `task-executor`. The playwright field should appear within each log entry:

```markdown
## [YYYY-MM-DD]

### Task: [Task name]
**Subtask:** [Subtask name]

**What was done:**
- ...

**Notes:**
- ...

checked by playwright-reviewer: NOT
```

> If entries don't have the `checked by playwright-reviewer:` field at all, add it as `NOT` at the end of each entry before processing.
