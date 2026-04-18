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
  EMPTY_CATALOG,
  FULL_CATALOG,
  renderWithClient,
} from './AiGenerationPanel.fixtures';

/**
 * Catalog-loading and capability-switching behavior for the AI Generation
 * panel. Form submission lives in `AiGenerationPanel.form.test.tsx`, and
 * job-state UI lives in `AiGenerationPanel.states.test.tsx`. The three
 * suffix-split files share fixtures via `AiGenerationPanel.fixtures.tsx` per
 * §9.7 split-test naming convention.
 */

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

describe('AiGenerationPanel / catalog', () => {
  it('renders the panel heading and testid', async () => {
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    expect(screen.getByTestId('ai-generation-panel')).toBeTruthy();
    expect(screen.getByText('AI Generate')).toBeTruthy();
    await waitFor(() => expect(mockListModels).toHaveBeenCalled());
  });

  it('shows a loading indicator while the catalog is pending', () => {
    mockListModels.mockImplementation(() => new Promise(() => undefined));
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    expect(screen.getByText(/loading models/i)).toBeTruthy();
  });

  it('shows an inline error + Retry when the catalog fails to load', async () => {
    mockListModels.mockRejectedValueOnce(new Error('boom'));
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() =>
      expect(screen.getByText(/could not load ai models/i)).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('renders empty state when the catalog is empty', async () => {
    mockListModels.mockResolvedValueOnce(EMPTY_CATALOG);
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() =>
      expect(screen.getByText(/no ai models available/i)).toBeTruthy(),
    );
  });

  it('renders capability tabs and models for the active capability only', async () => {
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());
    // Non-active capability models must not leak into the list.
    expect(screen.queryByText('Kling 2.5 Pro')).toBeNull();
  });

  it('switches to videos group and shows video capability tabs', async () => {
    const user = userEvent.setup();
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('tab', { name: /^videos$/i }));
    // After switching to Videos group, the default video capability (text_to_video) should show
    await waitFor(() => expect(screen.getByText('Kling 2.5 Pro')).toBeTruthy());
    expect(screen.queryByText('Nano Banana 2')).toBeNull();
  });

  it('switches capability within the same group and clears the selected model', async () => {
    const user = userEvent.setup();
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nano banana 2/i }));
    expect(screen.getByLabelText('Prompt')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /edit \/ blend/i }));
    expect(screen.queryByText('Nano Banana 2')).toBeNull();
    expect(screen.getByText('Seedream 4 Edit')).toBeTruthy();
  });

  it('shows audio capability tabs and the TTS model when the audio group is selected', async () => {
    const user = userEvent.setup();
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    await waitFor(() => expect(screen.getByText('Nano Banana 2')).toBeTruthy());

    await user.click(screen.getByRole('tab', { name: /^audio$/i }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /text to speech/i })).toBeTruthy(),
    );
    expect(screen.getAllByText('Text to Speech').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render the close button when onClose is omitted', () => {
    renderWithClient(<AiGenerationPanel context={PROJECT_CTX} />);
    expect(screen.queryByRole('button', { name: /close panel/i })).toBeNull();
  });
});
