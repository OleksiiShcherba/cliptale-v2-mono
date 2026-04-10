import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { FalModel } from '@/features/ai-generation/types';

const { mockGetAssets } = vi.hoisted(() => ({
  mockGetAssets: vi.fn(),
}));

vi.mock('@/features/asset-manager/api', () => ({
  getAssets: mockGetAssets,
}));

import { GenerationOptionsForm } from './GenerationOptionsForm';

const MODEL: FalModel = {
  id: 'fal-ai/nano-banana-2',
  capability: 'text_to_image',
  label: 'Nano Banana 2',
  description: 'Test model',
  inputSchema: {
    fields: [
      { name: 'prompt', type: 'text', label: 'Prompt', required: true },
      { name: 'num_images', type: 'number', label: 'Number of Images', required: false },
      {
        name: 'resolution',
        type: 'enum',
        label: 'Resolution',
        required: false,
        enum: ['1K', '2K'],
      },
    ],
  },
};

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAssets.mockResolvedValue([]);
});

describe('GenerationOptionsForm', () => {
  it('renders one input per schema field in schema order', () => {
    renderWithClient(
      <GenerationOptionsForm
        model={MODEL}
        values={{}}
        onChange={() => undefined}
        projectId="p1"
      />,
    );
    expect(screen.getByLabelText('Prompt')).toBeTruthy();
    expect(screen.getByLabelText('Number of Images')).toBeTruthy();
    expect(screen.getByLabelText('Resolution')).toBeTruthy();
  });

  it('shows a required marker on required fields', () => {
    renderWithClient(
      <GenerationOptionsForm
        model={MODEL}
        values={{}}
        onChange={() => undefined}
        projectId="p1"
      />,
    );
    // Only the "prompt" field is required, so there should be exactly one star.
    const stars = screen.getAllByText('*');
    expect(stars).toHaveLength(1);
  });

  it('merges field updates into the values record via onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <GenerationOptionsForm
        model={MODEL}
        values={{ prompt: 'existing' }}
        onChange={handleChange}
        projectId="p1"
      />,
    );

    await user.selectOptions(screen.getByLabelText('Resolution'), '2K');

    expect(handleChange).toHaveBeenCalledWith({ prompt: 'existing', resolution: '2K' });
  });

  it('removes a field from values when onChange emits undefined', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <GenerationOptionsForm
        model={MODEL}
        values={{ num_images: 3 }}
        onChange={handleChange}
        projectId="p1"
      />,
    );

    const numInput = screen.getByLabelText('Number of Images');
    await user.clear(numInput);

    expect(handleChange).toHaveBeenLastCalledWith({});
  });
});
