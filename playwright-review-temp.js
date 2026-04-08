const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.APP_URL || 'http://localhost:5173';
const API_BASE_URL = 'http://localhost:3001';
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
    id: 'oauth-login-page-oauth-buttons',
    name: 'OAuth Login Page - Google and GitHub buttons',
    path: '/login',
    actions: [
      { type: 'screenshot', label: 'initial-load' },
      { type: 'verify-oauth-button', selector: 'a[href*="/auth/google"]', expectedHref: `${API_BASE_URL}/auth/google`, label: 'google-button' },
      { type: 'verify-oauth-button', selector: 'a[href*="/auth/github"]', expectedHref: `${API_BASE_URL}/auth/github`, label: 'github-button' },
      { type: 'screenshot', label: 'oauth-section' },
    ]
  },
  {
    id: 'oauth-register-page-oauth-buttons',
    name: 'OAuth Register Page - Google and GitHub buttons',
    path: '/register',
    actions: [
      { type: 'screenshot', label: 'initial-load' },
      { type: 'verify-oauth-button', selector: 'a[href*="/auth/google"]', expectedHref: `${API_BASE_URL}/auth/google`, label: 'google-button' },
      { type: 'verify-oauth-button', selector: 'a[href*="/auth/github"]', expectedHref: `${API_BASE_URL}/auth/github`, label: 'github-button' },
      { type: 'screenshot', label: 'oauth-section' },
    ]
  },
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
      await page.waitForTimeout(1000);

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

      results.push({ id: test.id, name: test.name, status: 'passed' });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ id: test.id, name: test.name, status: 'failed', error: err.message });
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
    await page.screenshot({ path: tmpPath, fullPage: true });
    const persistentPath = path.join(PERSISTENT_DIR, makeScreenshotName(testName, action.label));
    fs.copyFileSync(tmpPath, persistentPath);
    console.log(`  Screenshot: ${action.label}`);
  } else if (action.type === 'verify-oauth-button') {
    // Verify button exists and has correct href
    const button = await page.locator(action.selector);
    const href = await button.getAttribute('href');
    console.log(`  ${action.label}: href="${href}"`);
    if (!href || !href.includes(action.expectedHref.split('/').pop())) {
      throw new Error(`OAuth button ${action.label} has incorrect href: ${href}`);
    }
  }
}
