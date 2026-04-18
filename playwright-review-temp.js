const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.APP_URL || 'http://localhost:5173';
const SCREENSHOT_DIR = './playwright-screenshots';
const PERSISTENT_DIR = './docs/test_screenshots';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(PERSISTENT_DIR, { recursive: true });

function makeScreenshotName(testName, label) {
  const words = testName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).join('-');
  const suffix = label ? `-${label}` : '';
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join('-');
  return `${words}${suffix}_${time}.png`;
}

const tests = [
  {
    id: 'wizard-ai-tab-20260418',
    name: 'Wizard AI tab',
    path: '/generate',
    actions: [
      { type: 'screenshot', label: 'page-load' },
      { type: 'wait-for-selector', selector: '[aria-label="AI tab"]', timeout: 10000 },
      { type: 'screenshot', label: 'before-ai-click' },
      { type: 'click', selector: '[aria-label="AI tab"]' },
      { type: 'wait-for-timeout', ms: 800 },
      { type: 'screenshot', label: 'after-ai-click' },
      { type: 'click', selector: '[aria-label="Recent tab"]' },
      { type: 'wait-for-timeout', ms: 800 },
      { type: 'screenshot', label: 'after-recent-click' },
      { type: 'click', selector: '[aria-label="Folders tab"]' },
      { type: 'wait-for-timeout', ms: 800 },
      { type: 'screenshot', label: 'after-folders-click' },
    ]
  }
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

      if (test.actions) {
        for (const action of test.actions) {
          await performAction(page, action, SCREENSHOT_DIR, test.id, test.name);
        }
      }

      results.push({ id: test.id, name: test.name, status: 'captured' });
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
    await page.locator(action.selector).click({ timeout: 5000 }).catch(err => {
      console.error(`  Click failed for ${action.selector}: ${err.message}`);
    });
    await page.waitForTimeout(500);
  } else if (action.type === 'wait-for-selector') {
    await page.waitForSelector(action.selector, { timeout: action.timeout }).catch(err => {
      console.error(`  Selector wait failed: ${action.selector} (${err.message})`);
    });
  } else if (action.type === 'wait-for-timeout') {
    await page.waitForTimeout(action.ms);
  } else if (action.type === 'screenshot') {
    const tmpPath = path.join(dir, `${testId}-${action.label}.png`);
    await page.screenshot({ path: tmpPath, fullPage: true });
    const persistentPath = path.join(PERSISTENT_DIR, makeScreenshotName(testName, action.label));
    fs.copyFileSync(tmpPath, persistentPath);
    console.log(`  Screenshot: ${persistentPath}`);
  }
}
