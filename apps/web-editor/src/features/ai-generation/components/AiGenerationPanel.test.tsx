import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockListProviders, mockInvalidateQueries } = vi.hoisted(() => ({
  mockListProviders: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('@/features/ai-providers/api', () => ({
  listProviders: mockListProviders,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const { mockUseAiGeneration } = vi.hoisted(() => ({
  mockUseAiGeneration: vi.fn(),
}));

vi.mock('@/features/ai-generation/hooks/useAiGeneration', () => ({
  useAiGeneration: mockUseAiGeneration,
}));

import { AiGenerationPanel } from './AiGenerationPanel';

function defaultHookReturn() {
  return {
    submit: vi.fn(),
    currentJob: null,
    isGenerating: false,
    error: null,
    reset: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListProviders.mockResolvedValue([
    { provider: 'openai', isActive: true, isConfigured: true, createdAt: '2026-01-01' },
  ]);
  mockUseAiGeneration.mockReturnValue(defaultHookReturn());
});

describe('AiGenerationPanel', () => {
  it('renders the panel with "AI Generate" heading', () => {
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('AI Generate')).toBeTruthy();
  });

  it('renders the close button when onClose is provided', () => {
    const onClose = vi.fn();
    render(<AiGenerationPanel projectId="proj-1" onClose={onClose} />);
    const btn = screen.getByRole('button', { name: /close panel/i });
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render close button when onClose is not provided', () => {
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.queryByRole('button', { name: /close panel/i })).toBeNull();
  });

  it('renders the idle phase with type selector and prompt input', () => {
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /generation prompt/i })).toBeTruthy();
    expect(screen.getByText('Generate')).toBeTruthy();
  });

  it('shows character count for the prompt', () => {
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('0/1000')).toBeTruthy();
  });

  it('shows disabled notice when no provider is configured for selected type', async () => {
    mockListProviders.mockResolvedValue([]);
    render(<AiGenerationPanel projectId="proj-1" />);

    // Wait for providers to load (next tick)
    await vi.waitFor(() => {
      expect(screen.getByText(/no provider configured/i)).toBeTruthy();
    });
  });

  it('shows the "Configure in AI Providers" link when onOpenProviders is given', async () => {
    mockListProviders.mockResolvedValue([]);
    const onOpenProviders = vi.fn();
    render(<AiGenerationPanel projectId="proj-1" onOpenProviders={onOpenProviders} />);

    await vi.waitFor(() => {
      const link = screen.getByText('Configure in AI Providers');
      expect(link).toBeTruthy();
      fireEvent.click(link);
    });

    expect(onOpenProviders).toHaveBeenCalledTimes(1);
  });

  it('renders "Submitting..." when isGenerating but no currentJob yet', () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      isGenerating: true,
      currentJob: null,
    });
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('Submitting...')).toBeTruthy();
  });

  it('renders GenerationProgress when generating with a current job', () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      isGenerating: true,
      currentJob: {
        jobId: 'job-1',
        status: 'processing',
        progress: 60,
        resultAssetId: null,
        errorMessage: null,
      },
    });
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText('Processing... 60%')).toBeTruthy();
  });

  it('renders success state with "Added to your Assets" and "Generate Another" button', () => {
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
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('Generation complete!')).toBeTruthy();
    expect(screen.getByText('Added to your Assets')).toBeTruthy();
    expect(screen.getByText('Generate Another')).toBeTruthy();
  });

  it('renders "View in Assets" button when onSwitchToAssets is provided', () => {
    const onSwitchToAssets = vi.fn();
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
    render(<AiGenerationPanel projectId="proj-1" onSwitchToAssets={onSwitchToAssets} />);
    expect(screen.getByText('View in Assets')).toBeTruthy();
  });

  it('calls onSwitchToAssets and resets when "View in Assets" is clicked', () => {
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
    render(<AiGenerationPanel projectId="proj-1" onSwitchToAssets={onSwitchToAssets} />);
    fireEvent.click(screen.getByText('View in Assets'));
    expect(onSwitchToAssets).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not render "View in Assets" when onSwitchToAssets is not provided', () => {
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
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.queryByText('View in Assets')).toBeNull();
  });

  it('renders failed state with "Try Again" button', () => {
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
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('Provider rate limit exceeded')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('renders error state when submit error occurs', () => {
    mockUseAiGeneration.mockReturnValue({
      ...defaultHookReturn(),
      error: 'Network error',
    });
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('calls reset when "Generate Another" is clicked', () => {
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
    render(<AiGenerationPanel projectId="proj-1" />);
    fireEvent.click(screen.getByText('Generate Another'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('has testid ai-generation-panel on root element', () => {
    render(<AiGenerationPanel projectId="proj-1" />);
    expect(screen.getByTestId('ai-generation-panel')).toBeTruthy();
  });

  it('refetches providers when isProvidersModalOpen flips from true to false', async () => {
    mockListProviders.mockResolvedValue([]);
    const { rerender } = render(
      <AiGenerationPanel projectId="proj-1" isProvidersModalOpen={true} />,
    );
    // Should NOT fetch while modal is open (only the initial mount fetch before modal opened)
    // The effect skips when isProvidersModalOpen is true
    const callCountWhileOpen = mockListProviders.mock.calls.length;

    // Now close the modal — should trigger a refetch
    mockListProviders.mockResolvedValue([
      { provider: 'openai', isActive: true, isConfigured: true, createdAt: '2026-01-01' },
    ]);
    rerender(<AiGenerationPanel projectId="proj-1" isProvidersModalOpen={false} />);

    await vi.waitFor(() => {
      expect(mockListProviders.mock.calls.length).toBeGreaterThan(callCountWhileOpen);
    });
  });

  it('does not show "No provider configured" after modal closes and provider was added', async () => {
    // Start with no providers
    mockListProviders.mockResolvedValue([]);
    const { rerender } = render(
      <AiGenerationPanel projectId="proj-1" isProvidersModalOpen={false} />,
    );

    await vi.waitFor(() => {
      expect(screen.getByText(/no provider configured/i)).toBeTruthy();
    });

    // Open modal
    rerender(<AiGenerationPanel projectId="proj-1" isProvidersModalOpen={true} />);

    // Close modal — provider was added
    mockListProviders.mockResolvedValue([
      { provider: 'openai', isActive: true, isConfigured: true, createdAt: '2026-01-01' },
    ]);
    rerender(<AiGenerationPanel projectId="proj-1" isProvidersModalOpen={false} />);

    await vi.waitFor(() => {
      expect(screen.queryByText(/no provider configured/i)).toBeNull();
    });
  });
});
