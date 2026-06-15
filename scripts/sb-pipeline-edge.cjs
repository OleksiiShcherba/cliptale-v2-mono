/* eslint-disable */
// Second UI pass — exercises the pipeline SIDE-flows as a client, via real clicks:
//   AC-06 cancel under loader (+ partials kept / re-trigger)
//   AC-15 corner-trigger scene_image with no scenes → plain-language guard
//   AC-08 phase-order guard
//   AC-05 resume (reload mid-phase → same screen)
//   AC-07 skip cast proposal (reference_data → skipped)
//   AC-11 text-only scene images after skipping references
// Creates its own fresh draft. Screenshots each checkpoint.

const { chromium } = require('playwright');
const path = require('node:path');

const TOKEN = process.env.TOKEN;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';
const SHOTS = process.env.SHOTS || '/tmp/sb-pipeline-shots/edge';
const STORAGE = path.resolve(__dirname, '../.e2e-cache/e2e-auth-state.json');

if (!TOKEN) { console.error('TOKEN env required'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, json: r.ok ? await r.json().catch(() => null) : null };
}
async function pipeline(draft) {
  const r = await api('GET', `/storyboards/${draft}/pipeline`);
  return r.json ?? { _http: r.status };
}
function sum(ps) {
  if (!ps || !ps.phases) return JSON.stringify(ps);
  const p = ps.phases;
  return `v${ps.version} active=${ps.active_run_phase ?? '-'} | scene=${p.scene?.status} reference_data=${p.reference_data?.status} reference_image=${p.reference_image?.status} scene_image=${p.scene_image?.status}`;
}

(async () => {
  // Fresh draft with a real prompt
  const created = await api('POST', '/generation-drafts', {
    promptDoc: { schemaVersion: 1, blocks: [{ type: 'text', value: 'A 12-second upbeat travel reel about a mountain hiking trip. Scene 1: hikers reach a summit at sunrise. Scene 2: a close-up of boots on a rocky trail. Scene 3: a panoramic valley view. Vibrant, energetic, natural light.' }] },
  });
  const DRAFT = created.json?.id;
  if (!DRAFT) { console.error('draft create failed', created.status); process.exit(1); }
  console.log(`\n=== EDGE DRAFT ${DRAFT} ===`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 160)));

  let step = 0;
  const shot = async (name) => {
    step++;
    const f = `${SHOTS}/${String(step).padStart(2, '0')}-${name}.png`;
    try { await page.screenshot({ path: f }); } catch {}
    console.log(`SHOT ${f}\n     ${sum(await pipeline(DRAFT))}`);
    return f;
  };
  const vis = async (t) => { try { return await page.getByTestId(t).first().isVisible(); } catch { return false; } };
  const waitFor = async (pred, label, ms = 120000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(2000); }
    console.log(`  TIMEOUT waiting for ${label}`); return false;
  };

  await page.goto(`${BASE}/storyboard/${DRAFT}`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await shot('open-scene-loader');

  // ── AC-06: cancel scene generation under the loader ───────────────────────
  if (await vis('blocking-loader')) {
    console.log('>>> AC-06: clicking Cancel under the scene loader');
    await page.getByTestId('blocking-loader-cancel').click().catch((e) => console.log('cancel click', String(e).slice(0,100)));
    await sleep(3000);
    await shot('after-cancel-scene');
  } else {
    console.log('  (scene loader already gone — scene gen finished before cancel; will still test guards)');
    await shot('scene-already-advanced');
  }

  // ── AC-15: corner-trigger scene_image while scenes may not exist → guard ──
  // Only meaningful if scene phase is not completed. Try regardless; capture the alert if shown.
  const psNow = await pipeline(DRAFT);
  if (psNow.phases?.scene?.status !== 'completed') {
    console.log('>>> AC-15: corner-trigger scene_image with no completed scenes → expect guard');
    if (await vis('step-corner-trigger-scene_image')) {
      await page.getByTestId('step-corner-trigger-scene_image').click().catch(() => {});
      await sleep(1500);
      const alert = await page.getByRole('alert').first().innerText().catch(() => '');
      console.log('     GUARD ALERT (scene_image, no scenes):', alert.replace(/\n/g,' ').slice(0,200));
      await shot('guard-scene-image-no-scenes');
    } else {
      console.log('     corner control disabled/absent (active phase running) — skipping guard attempt');
    }
  }

  // ── re-trigger scene generation via corner control ────────────────────────
  console.log('>>> re-trigger scene phase via corner control');
  // wait until no phase running so the corner is enabled
  await waitFor(async () => (await pipeline(DRAFT)).active_run_phase == null, 'no-active-phase', 30000);
  if (await vis('step-corner-trigger-scene')) {
    await page.getByTestId('step-corner-trigger-scene').click().catch(() => {});
    await sleep(2500);
    await shot('after-retrigger-scene');
  }

  // ── AC-05: resume — reload while a phase is running ───────────────────────
  await waitFor(async () => (await pipeline(DRAFT)).active_run_phase === 'scene' || (await vis('blocking-loader')), 'scene-running', 30000);
  console.log('>>> AC-05: reload page mid-phase (resume)');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const loaderAfterReload = await vis('blocking-loader');
  console.log('     blocking-loader visible after reload:', loaderAfterReload);
  await shot('resume-after-reload');

  // ── wait for cast proposal modal (AC-02) ──────────────────────────────────
  await waitFor(async () => vis('review-cast-proposal-modal'), 'cast-proposal-modal', 180000);
  if (await vis('review-cast-proposal-modal')) {
    const rows = await page.locator('[data-testid^="reference-scenes-"]').allInnerTexts().catch(() => []);
    console.log('     CAST PROPOSAL scenes:', rows.map((r) => r.trim()));
    await shot('cast-proposal');

    // ── AC-07: skip the cast proposal ───────────────────────────────────────
    console.log('>>> AC-07: clicking Skip on the cast proposal');
    await page.getByTestId('skip-button').click().catch((e) => console.log('skip click', String(e).slice(0,100)));
    await sleep(3000);
    await shot('after-skip-cast');
    console.log('     after skip:', sum(await pipeline(DRAFT)));
  }

  // ── AC-11: trigger scene images (text-only since references were skipped) ─
  await waitFor(async () => (await pipeline(DRAFT)).active_run_phase == null, 'idle-before-trigger', 30000);
  console.log('>>> AC-11: corner-trigger scene_image (text-only, refs skipped)');
  if (await vis('step-corner-trigger-scene_image')) {
    await page.getByTestId('step-corner-trigger-scene_image').click().catch(() => {});
    await sleep(2500);
    await shot('after-trigger-scene-image');
  }
  // If an offer modal appears, accept it
  if (await waitFor(async () => vis('scene-image-offer-modal'), 'scene-image-offer', 30000)) {
    console.log('     scene-image offer modal shown → accepting');
    await page.getByTestId('accept-button').click().catch(() => {});
    await sleep(2500);
    await shot('after-accept-scene-image');
  }

  // ── wait for scene_image terminal ─────────────────────────────────────────
  await waitFor(async () => {
    const s = (await pipeline(DRAFT)).phases?.scene_image?.status;
    return s === 'completed' || s === 'skipped' || s === 'failed';
  }, 'scene_image-terminal', 240000);
  await sleep(3000);
  await shot('FINAL-edge');
  console.log('\n=== EDGE FLOW DONE ===', sum(await pipeline(DRAFT)));
  console.log('EDGE_DRAFT_ID=' + DRAFT);

  await browser.close();
})().catch((e) => { console.error('EDGE DRIVER ERROR', e); process.exit(1); });
