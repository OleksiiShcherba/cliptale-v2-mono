import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockListModels } = vi.hoisted(() => ({
  mockListModels: vi.fn(),
}));
vi.mock('@/features/ai-generation/api', () => ({
  listModels: mockListModels,
}));

const { mockUseAiGeneration } = vi.hoisted(() => ({
  mockUseAiGeneration: vi.fn(),
}));
vi.mock('@/features/ai-generation/hooks/useAiGeneration', () => ({
  useAiGeneration: mockUseAiGeneration,
}));

const { mockGetAssets } = vi.hoisted(() => ({
  mockGetAssets: vi.fn(),
}));
vi.mock('@/features/asset-manager/api', () => ({
  getAssets: mockGetAssets,
}));

import { AiGenerationPanel } from './AiGenerationPanel';
import {
  defaultHookReturn,
  FULL_CATALOG,
  renderWithClient,
} from './AiGenerationPanel.fixtures';

/** Form validation and submit-payload behavior. Split from the main panel
 *  test file per §9.7 (300-line cap). Fixtures shared via
 *  `AiGenerationPanel.fixtures.tsx`. */

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAiGeneration.mockReturnValue(defaultHookReturn());
  mockGetAssets.mockResolvedValue([]);
  mockListModels.mockResolvedValue(FULL_CATALOG);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AiGenerationPanel / form', () => {
  it('disables Generate until required fields are filled', async () => {
    const user = userEvent.setup();
    renderWithClient(<AiGenerationPanel projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nano banana 2/i }));
    const generateBtn = screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);

    await user.type(screen.getByLabelText('Prompt'), 'A cat in space');
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits { modelId, prompt, options } extracting top-level prompt from values', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    mockUseAiGeneration.mockReturnValue({ ...defaultHookReturn(), submit });

    renderWithClient(<AiGenerationPanel projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nano banana 2/i }));
    await user.type(screen.getByLabelText('Prompt'), 'A cat in space');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('proj-1', {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'A cat in space',
      options: { num_images: 1 },
    });
  });
});
