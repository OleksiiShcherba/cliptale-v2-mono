/* eslint-disable */
// Standalone Playwright driver for the storyboard-generation-pipeline live check.
// Walks Step-2: scene gen → cast proposal → reference images → scene-image offer → scene images.
// Screenshots every phase + acts on the review modals. Tracks the backend pipeline
// state via the API so phase transitions are logged even if a loader flashes by.

const { chromium } = require('playwright');
const path = require('node:path');

const DRAFT = process.env.DRAFT_ID;
const TOKEN = process.env.TOKEN;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';
const SHOTS = process.env.SHOTS || '/tmp/sb-pipeline-shots';
const STORAGE = path.resolve(__dirname, '../.e2e-cache/e2e-auth-state.json');
const MAX_MS = 18 * 60 * 1000; // 18 min wall-clock budget

if (!DRAFT || !TOKEN) { console.error('DRAFT_ID and TOKEN env required'); process.exit(1); }

async function pipeline() {
  try {
    const r = await fetch(`${API}/storyboards/${DRAFT}/pipeline`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) return { _http: r.status };
    return await r.json();
  } catch (e) { return { _err: String(e) }; }
}

function phaseSummary(ps) {
  if (!ps || !ps.phases) return JSON.stringify(ps);
  const p = ps.phases;
  const f = (k) => `${k}=${p[k]?.status ?? '?'}`;
  return `v${ps.version} active=${ps.active_run_phase ?? '-'} | ${f('scene')} ${f('reference_data')} ${f('reference_image')} ${f('scene_image')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser-console-error]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

  let step = 0;
  const shot = async (name) => {
    step++;
    const file = `${SHOTS}/${String(step).padStart(2, '0')}-${name}.png`;
    try { await page.screenshot({ path: file }); } catch (e) { console.log('  screenshot failed', String(e).slice(0,120)); }
    const ps = await pipeline();
    console.log(`SHOT ${file}\n     ${phaseSummary(ps)}`);
    return ps;
  };
  const visible = async (testid) => {
    try { return await page.getByTestId(testid).first().isVisible(); } catch { return false; }
  };

  console.log(`\n=== DRIVING draft ${DRAFT} ===`);
  console.log('initial pipeline state:', phaseSummary(await pipeline()));

  await page.goto(`${BASE}/storyboard/${DRAFT}`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await shot('after-open');

  const start = Date.now();
  let confirmedCast = false;
  let acceptedSceneImage = false;
  let lastVersion = -1;
  let lastModalShot = '';

  while (Date.now() - start < MAX_MS) {
    const ps = await pipeline();
    const phases = ps.phases ?? {};
    const sceneImageStatus = phases.scene_image?.status;

    // Screenshot whenever the backend version advances (a real transition).
    if (typeof ps.version === 'number' && ps.version !== lastVersion) {
      lastVersion = ps.version;
      await shot(`v${ps.version}-${ps.active_run_phase ?? 'idle'}`);
    }

    // --- AC-02: Review cast proposal modal ---
    if (!confirmedCast && (await visible('review-cast-proposal-modal'))) {
      if (lastModalShot !== 'cast') {
        lastModalShot = 'cast';
        await shot('cast-proposal-modal');
        // Read the per-reference scene counts (the r6/r7 "0 scenes" regression check)
        const rows = await page.locator('[data-testid^="reference-scenes-"]').allInnerTexts().catch(() => []);
        const names = await page.locator('[data-testid^="reference-name-"]').allInnerTexts().catch(() => []);
        console.log('     CAST PROPOSAL references:', names.map((n, i) => `${n.trim()} → ${(rows[i]||'').trim()}`));
      }
      await sleep(1000);
      const btn = page.getByTestId('confirm-button');
      if (await btn.isVisible().catch(() => false)) {
        console.log('     >>> clicking confirm-button (confirm cast)');
        await btn.click().catch((e) => console.log('confirm click failed', String(e).slice(0,120)));
        confirmedCast = true;
        await sleep(2000);
        await shot('after-confirm-cast');
      }
      continue;
    }

    // --- AC-04: Scene-image offer modal ---
    if (!acceptedSceneImage && (await visible('scene-image-offer-modal'))) {
      if (lastModalShot !== 'offer') {
        lastModalShot = 'offer';
        const cnt = await page.getByTestId('scene-count').innerText().catch(() => '?');
        const cost = await page.getByTestId('cost-estimate').innerText().catch(() => '?');
        await shot('scene-image-offer-modal');
        console.log(`     SCENE-IMAGE OFFER scene-count="${cnt}" cost-estimate="${cost}"`);
      }
      await sleep(1000);
      const btn = page.getByTestId('accept-button');
      if (await btn.isVisible().catch(() => false)) {
        console.log('     >>> clicking accept-button (accept scene-image generation)');
        await btn.click().catch((e) => console.log('accept click failed', String(e).slice(0,120)));
        acceptedSceneImage = true;
        await sleep(2000);
        await shot('after-accept-scene-image');
      }
      continue;
    }

    // --- Failure banner ---
    if (await visible('pipeline-failure-banner')) {
      const txt = await page.getByTestId('pipeline-failure-banner').innerText().catch(() => '');
      console.log('     !!! PIPELINE FAILURE BANNER:', txt.replace(/\n/g, ' ').slice(0, 300));
      await shot('failure-banner');
      // try retry once
      const retry = page.getByTestId('pipeline-failure-retry');
      if (await retry.isVisible().catch(() => false)) {
        console.log('     >>> clicking retry');
        await retry.click().catch(() => {});
        await sleep(3000);
      } else {
        break;
      }
    }

    // --- Terminal success: scene_image completed (and we accepted it) ---
    if (acceptedSceneImage && (sceneImageStatus === 'completed' || sceneImageStatus === 'skipped')) {
      await sleep(3000);
      await shot('FINAL-scene-images-complete');
      console.log('\n=== PIPELINE COMPLETE ===', phaseSummary(ps));
      break;
    }

    await sleep(3000);
  }

  if (Date.now() - start >= MAX_MS) {
    console.log('\n!!! TIMEOUT — pipeline did not complete within budget');
    await shot('TIMEOUT');
  }

  await browser.close();
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(1); });
