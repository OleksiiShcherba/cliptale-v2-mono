/* Check if scene blocks are visible on canvas */
const { chromium } = require('playwright');
const path = require('node:path');

const DRAFT = process.env.DRAFT_ID;
const BASE = 'http://localhost:5173';
const STORAGE = path.resolve(__dirname, '../.e2e-cache/e2e-auth-state.json');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/storyboard/${DRAFT}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Check for scene blocks on canvas
  const sceneBlocks = await page.locator('[data-testid^="scene-block"]').all();
  const sceneCount = sceneBlocks.length;
  console.log('Scene blocks found:', sceneCount);

  // Check react-flow nodes
  const rfNodes = await page.locator('.react-flow__node').all();
  const nodeTypes = await page.locator('.react-flow__node').evaluateAll(
    (nodes) => nodes.map((n) => ({ class: n.className, testid: n.getAttribute('data-testid') || n.querySelector('[data-testid]')?.getAttribute('data-testid') }))
  );
  console.log('React Flow nodes:', JSON.stringify(nodeTypes, null, 2));

  await page.screenshot({ path: '/tmp/sb-canvas-check.png', fullPage: false });
  console.log('Screenshot taken at /tmp/sb-canvas-check.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
