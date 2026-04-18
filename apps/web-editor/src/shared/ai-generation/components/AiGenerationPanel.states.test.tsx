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

/** Job-state UI (generating / success / failure). Split from the main panel
 *  test file per §9.7 (300-line cap). Fixtures shared via
 *  `AiGenerationPanel.fixtures.tsx`. */

const PROJECT_CTX = { kind: 'project' as const, id: 'proj-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAiGeneration.mockReturnValue(defaultHookReturn());
  mockGetContextAssets.mockResolvedValue([]);
  mockListModels.mockResolvedValue(FULL_CATALOG);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AiGenerationPanel / states', () => {
  it('renders GenerationProgress while a job is running', async () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      isGenerating: true,
      currentJob: {
        jobId: 'job-1',
        status: 'processing',
        progress: 40,
        resultAssetId: null,
        errorMessage: null,
      },
    });
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy());
  });

  it('renders "Submitting…" while generating with no job yet', async () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      isGenerating: true,
      currentJob: null,
    });
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText(/submitting/i)).toBeTruthy());
  });

  it('renders the success state with "Added to your Assets"', async () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      currentJob: {
        jobId: 'job-1',
        status: 'completed',
        progress: 100,
        resultAssetId: 'asset-1',
        errorMessage: null,
      },
    });
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Generation complete!')).toBeTruthy());
    expect(screen.getByText('Added to your Assets')).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate another/i })).toBeTruthy();
  });

  it('renders "View in Assets" and calls both callbacks when clicked', async () => {
    const user = userEvent.setup();
    const onSwitchToAssets = vi.fn();
    const reset = vi.fn();
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      reset,
      currentJob: {
        jobId: 'job-1',
        status: 'completed',
        progress: 100,
        resultAssetId: 'asset-1',
        errorMessage: null,
      },
    });
    renderWithClient(
      <AiGenerationPanel context={PROJECT_CTX} onSwitchToAssets={onSwitchToAssets} />,
    );
    await waitFor(() => expect(screen.getByText('View in Assets')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /view in assets/i }));
    expect(onSwitchToAssets).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders the failed state with an error message and a Retry action', async () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      currentJob: {
        jobId: 'job-1',
        status: 'failed',
        progress: 30,
        resultAssetId: null,
        errorMessage: 'Provider rate limit exceeded',
      },
    });
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() =>
      expect(screen.getByText('Provider rate limit exceeded')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('renders the submit error state when the hook reports an error', async () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      error: 'Network error',
    });
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
  });
});
