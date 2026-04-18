import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockListModels, mockGetContextAssets } = vi.hoisted(() => ({
  mockListModels: vi.fn(),
  mockGetContextAssets: vi.fn(),
}));
vi.mock('@/shared/ai-generation/api', () => ({
  listModels: mockListModels,
  getContextAssets: mockGetContextAssets,
}));

const { mockUseAiGeneration } = vi.hoisted(() => ({
  mockUseAiGeneration: vi.fn(),
}));
vi.mock('@/shared/ai-generation/hooks/useAiGeneration', () => ({
  useAiGeneration: mockUseAiGeneration,
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

const PROJECT_CTX = { kind: 'project' as const, id: 'proj-1' };
const DRAFT_CTX = { kind: 'draft' as const, id: 'draft-42' };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAiGeneration.mockReturnValue(defaultHookReturn());
  mockGetContextAssets.mockResolvedValue([]);
  mockListModels.mockResolvedValue(FULL_CATALOG);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AiGenerationPanel / form', () => {
  it('disables Generate until required fields are filled', async () => {
    const user = userEvent.setup();
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nano banana 2/i }));
    const generateBtn = screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);

    await user.type(screen.getByLabelText('Prompt'), 'A cat in space');
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits with project context — calls submit with { kind: "project", id }', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    mockUseAiGeneration.mockReturnValue({ ...defaultHookReturn(), submit });

    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nano banana 2/i }));
    await user.type(screen.getByLabelText('Prompt'), 'A cat in space');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(PROJECT_CTX, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'A cat in space',
      options: { num_images: 1 },
    });
  });

  it('submits with draft context — calls submit with { kind: "draft", id }', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    mockUseAiGeneration.mockReturnValue({ ...defaultHookReturn(), submit });

    renderWithClient(<AiGenerationPanel context={DRAFT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nano banana 2/i }));
    await user.type(screen.getByLabelText('Prompt'), 'A robot on the moon');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(DRAFT_CTX, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'A robot on the moon',
      options: { num_images: 1 },
    });
  });
});
