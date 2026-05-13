import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

import { installCorsWorkaround } from './helpers/cors-workaround';
import { E2E_API_URL } from './helpers/env';
import { cleanupDraft, readBearerToken } from './helpers/storyboard';

type PromptDoc = {
  schemaVersion: 1;
  blocks: Array<{ type: 'text'; value: string }>;
  settings?: {
    videoLengthSeconds: number;
    aspectRatio: '16:9' | '9:16' | '1:1';
    styleKey: 'cinematic' | 'documentary' | 'social' | 'product' | 'minimal';
    modelPreference?: string | null;
  };
};

async function createDraft(
  apiContext: APIRequestContext,
  token: string,
  promptDoc: PromptDoc,
): Promise<string> {
  const res = await apiContext.post(`${E2E_API_URL}/generation-drafts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { promptDoc },
  });
  if (!res.ok()) {
    throw new Error(`POST /generation-drafts failed (${res.status()}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Draft creation response missing id');
  return data.id;
}

async function readDraft(
  apiContext: APIRequestContext,
  token: string,
  draftId: string,
): Promise<{ promptDoc: PromptDoc }> {
  const res = await apiContext.get(`${E2E_API_URL}/generation-drafts/${draftId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`GET /generation-drafts/${draftId} failed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as { promptDoc: PromptDoc };
}

async function waitForDraftSettingsSave(page: Page, draftId: string): Promise<void> {
  const response = await page.waitForResponse((res) => {
    return (
      res.request().method() === 'PUT' &&
      res.url().includes(`/generation-drafts/${draftId}`) &&
      res.status() === 200
    );
  });
  await response.finished();
}

async function expectSavedSettings(
  page: Page,
  token: string,
  draftId: string,
  expected: NonNullable<PromptDoc['settings']>,
): Promise<void> {
  await expect
    .poll(async () => {
      const saved = await readDraft(page.request, token, draftId);
      return saved.promptDoc.settings;
    })
    .toEqual(expected);
}

test.describe('Generate wizard draft settings', () => {
  test.beforeEach(async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);
    await page.addInitScript(() => {
      window.localStorage.setItem('proTip:generateStep1', 'dismissed');
    });
  });

  test('persists changed Step 1 settings and hydrates them on resume', async ({ page }) => {
    const token = await readBearerToken();
    const draftId = await createDraft(page.request, token, {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'Make a short product launch video.' }],
    });

    try {
      await page.goto(`/generate?draftId=${draftId}`);

      await expect(page.getByRole('textbox', { name: 'Prompt editor' }))
        .toContainText('Make a short product launch video.');
      await expect(page.getByRole('spinbutton', { name: 'Video length' })).toHaveValue('30');
      await expect(page.getByRole('button', { name: '16:9' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('combobox', { name: 'Style' })).toHaveValue('cinematic');

      const savePromise = waitForDraftSettingsSave(page, draftId);
      await page.getByRole('spinbutton', { name: 'Video length' }).fill('75');
      await page.getByRole('button', { name: '1:1' }).click();
      await page.getByRole('combobox', { name: 'Style' }).selectOption('product');
      await savePromise;

      await expectSavedSettings(page, token, draftId, {
        videoLengthSeconds: 75,
        aspectRatio: '1:1',
        styleKey: 'product',
        modelPreference: null,
      });

      await page.reload();

      await expect(page.getByRole('spinbutton', { name: 'Video length' })).toHaveValue('75');
      await expect(page.getByRole('button', { name: '1:1' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('combobox', { name: 'Style' })).toHaveValue('product');
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  test('clicking Next flushes a pending settings-only change before opening storyboard', async ({ page }) => {
    const token = await readBearerToken();
    const draftId = await createDraft(page.request, token, {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'Build a social teaser.' }],
    });

    try {
      await page.goto(`/generate?draftId=${draftId}`);

      await expect(page.getByRole('textbox', { name: 'Prompt editor' }))
        .toContainText('Build a social teaser.');
      const savePromise = waitForDraftSettingsSave(page, draftId);
      await page.getByRole('spinbutton', { name: 'Video length' }).fill('120');
      await page.getByTestId('next-button').click();
      await savePromise;

      await expect(page).toHaveURL(new RegExp(`/storyboard/${draftId}$`));

      await expectSavedSettings(page, token, draftId, {
        videoLengthSeconds: 120,
        aspectRatio: '16:9',
        styleKey: 'cinematic',
        modelPreference: null,
      });
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });
});
