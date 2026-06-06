/**
 * E2E — storyboard checkpoint flows (storyboard-autosave-checkpoints T15).
 *
 * Scenarios against the live stack:
 * - AC-05: no changes → "All saved" idle bar, Save inactive, zero entries.
 * - AC-07 / AC-03 surface: a change starts the countdown; manual Save pushes
 *   exactly one checkpoint entry and the bar returns to idle (AC-06 reset).
 * - AC-08: the History panel lists the checkpoint entries.
 * - AC-04: a DETERMINISTIC forced slow-capture (Image never loads → the 5 s
 *   timeout wins) still creates the entry — with the minimap preview — and the
 *   full-screen loader is dismissed.
 * - AC-12: restoring an older entry with newer changes first creates a
 *   pre-restore checkpoint.
 * - AC-03: with the 30 s preset an automatic checkpoint fires by itself.
 */

import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';
import {
  readBearerToken,
  createTempDraft,
  initializeDraft,
  cleanupDraft,
  waitForCanvas,
} from './helpers/storyboard';

type HistoryEntry = {
  id: number;
  previewKind: 'screenshot' | 'minimap' | null;
  snapshot: { blocks?: unknown[]; thumbnail?: string };
  createdAt: string;
};

async function fetchHistory(
  request: APIRequestContext,
  token: string,
  draftId: string,
): Promise<HistoryEntry[]> {
  const res = await request.get(`${E2E_API_URL}/storyboards/${draftId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as HistoryEntry[];
}

async function openBoard(page: Page, draftId: string): Promise<void> {
  await page.goto(`/storyboard/${draftId}`);
  await waitForCanvas(page);
}

/** Adds one scene block — the canonical "change" for these scenarios. */
async function makeChange(page: Page): Promise<void> {
  const before = await page.getByTestId('scene-block-node').count();
  await page.getByTestId('add-block-button').click();
  await expect(page.getByTestId('scene-block-node')).toHaveCount(before + 1, {
    timeout: 10_000,
  });
}

test.describe('Storyboard checkpoints', () => {
  let token: string;
  let draftId: string;

  test.beforeEach(async ({ request }) => {
    token = await readBearerToken();
    draftId = await createTempDraft(request, token);
    await initializeDraft(request, token, draftId);
  });

  test.afterEach(async ({ request }) => {
    await cleanupDraft(request, token, draftId);
  });

  test('idle board: "All saved", Save inactive, zero checkpoint entries (AC-05)', async ({ page, request }) => {
    await openBoard(page, draftId);

    const bar = page.getByTestId('checkpoint-countdown-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByText(/all saved/i)).toBeVisible();
    await expect(bar.getByRole('button', { name: /save checkpoint now/i })).toBeDisabled();

    const entries = await fetchHistory(request, token, draftId);
    expect(entries).toHaveLength(0);
  });

  test('change → countdown; manual Save → one checkpoint, bar resets (AC-07 / AC-06 / AC-08)', async ({ page, request }) => {
    await openBoard(page, draftId);
    await makeChange(page);

    const bar = page.getByTestId('checkpoint-countdown-bar');
    await expect(bar.getByText(/next checkpoint in/i)).toBeVisible({ timeout: 10_000 });

    const saveBtn = bar.getByRole('button', { name: /save checkpoint now/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // The bar returns to the idle state after the checkpoint (AC-06 reset).
    await expect(bar.getByText(/all saved/i)).toBeVisible({ timeout: 15_000 });

    const entries = await fetchHistory(request, token, draftId);
    expect(entries).toHaveLength(1);
    expect(['screenshot', 'minimap']).toContain(entries[0]!.previewKind);

    // AC-08: the History panel lists the checkpoint entry.
    await page.getByRole('button', { name: /toggle history panel/i }).click();
    await expect(page.getByTestId('history-entry-row')).toHaveCount(1, { timeout: 10_000 });
  });

  test('forced slow capture → minimap entry, loader dismissed (AC-04)', async ({ page, request }) => {
    test.setTimeout(60_000);

    // Deterministic slow capture: html-to-image builds its JPEG via
    // `new Image()`; an Image whose src never loads hangs the capture, so the
    // 5 s CAPTURE_TIMEOUT wins and the push falls back to the minimap.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      (window as unknown as { Image: unknown }).Image = class {
        crossOrigin = '';
        decoding = '';
        set src(_v: string) { /* never loads */ }
        set onload(_f: unknown) { /* never fires */ }
        set onerror(_f: unknown) { /* never fires */ }
        addEventListener(): void { /* noop */ }
        removeEventListener(): void { /* noop */ }
        decode(): Promise<never> { return new Promise<never>(() => { /* hangs */ }); }
      };
    });

    await openBoard(page, draftId);
    await makeChange(page);

    const bar = page.getByTestId('checkpoint-countdown-bar');
    await bar.getByRole('button', { name: /save checkpoint now/i }).click();

    // The full-screen loader covers the page during the capture…
    const overlay = page.getByTestId('checkpoint-capture-overlay');
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    // …and is dismissed once the 5 s timeout resolves the capture (AC-04).
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    const entries = await fetchHistory(request, token, draftId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.previewKind).toBe('minimap');
    expect(entries[0]!.snapshot.thumbnail).toBeUndefined();

    // The panel renders the SVG minimap for the fallback entry.
    await page.getByRole('button', { name: /toggle history panel/i }).click();
    await expect(page.getByTestId('snapshot-minimap').first()).toBeVisible({ timeout: 10_000 });
  });

  test('restore with newer changes creates a pre-restore checkpoint first (AC-12)', async ({ page, request }) => {
    test.setTimeout(60_000);
    await openBoard(page, draftId);

    // Checkpoint #1 — one scene block.
    await makeChange(page);
    const bar = page.getByTestId('checkpoint-countdown-bar');
    await bar.getByRole('button', { name: /save checkpoint now/i }).click();
    await expect(bar.getByText(/all saved/i)).toBeVisible({ timeout: 15_000 });

    // Newer change that is NOT checkpointed yet (second scene block).
    await makeChange(page);

    // Restore the older entry — accept the confirm dialog.
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /toggle history panel/i }).click();
    await expect(page.getByTestId('history-entry-row').first()).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('history-restore-button').first().click();

    // AC-12: the pre-restore checkpoint lands BEFORE the restore applies —
    // history grows to 2 and the newest entry carries the 2-scene state.
    await expect
      .poll(async () => (await fetchHistory(request, token, draftId)).length, {
        timeout: 20_000,
      })
      .toBe(2);

    const entries = await fetchHistory(request, token, draftId);
    const newest = entries[0]!;
    const sceneBlocks = (newest.snapshot.blocks ?? []).filter(
      (b) => (b as { blockType?: string }).blockType === 'scene',
    );
    expect(sceneBlocks).toHaveLength(2);
  });

  test('the 30 s preset fires an automatic checkpoint by itself (AC-03 / AC-09)', async ({ page, request }) => {
    test.setTimeout(90_000);

    // Store the shortest preset for this account, then open the board fresh.
    const put = await request.put(`${E2E_API_URL}/users/me/settings`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      data: { autosaveIntervalSeconds: 30 },
    });
    expect(put.ok()).toBeTruthy();

    try {
      await openBoard(page, draftId);
      await makeChange(page);

      // No clicks: the scheduler fires the checkpoint at the 30 s deadline.
      await expect
        .poll(async () => (await fetchHistory(request, token, draftId)).length, {
          timeout: 45_000,
          intervals: [2_000],
        })
        .toBe(1);
    } finally {
      await request.put(`${E2E_API_URL}/users/me/settings`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        data: { autosaveIntervalSeconds: 60 },
      });
    }
  });
});
