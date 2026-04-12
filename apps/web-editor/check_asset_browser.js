const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Wait for the app shell to render
    await page.waitForTimeout(1000);
    
    // Take a screenshot of the main editor
    await page.screenshot({ path: '/tmp/editor_loaded.png', fullPage: false });
    console.log('✓ Editor loaded successfully');
    
    // Check if asset panel is visible (right sidebar)
    const assetPanelSelector = '[data-testid="asset-browser"]';
    const assetPanel = await page.locator(assetPanelSelector).first();
    
    if (await assetPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✓ Asset browser panel is visible');
    } else {
      console.log('✗ Asset browser panel not found, checking for any asset-related elements');
      const allSelectors = await page.locator('[data-testid*="asset"]').count();
      console.log(`  Found ${allSelectors} elements with "asset" in testid`);
    }
    
    // Check for any console errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(`CONSOLE ERROR: ${msg.text()}`);
      }
    });
    
    await page.waitForTimeout(500);
    if (logs.length > 0) {
      console.log('✗ Console errors detected:');
      logs.forEach(log => console.log(`  ${log}`));
    } else {
      console.log('✓ No console errors');
    }
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
