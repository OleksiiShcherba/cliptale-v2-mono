import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { FalFieldSchema } from '@/shared/ai-generation/types';
import { LIBRARY_VOICE } from './SchemaFieldInput.fixtures';

const {
  mockGetContextAssets,
  mockListUserVoices,
  mockListAvailableVoices,
  mockGetVoiceSampleUrl,
} = vi.hoisted(() => ({
  mockGetContextAssets: vi.fn(),
  mockListUserVoices: vi.fn(),
  mockListAvailableVoices: vi.fn(),
  mockGetVoiceSampleUrl: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  getContextAssets: mockGetContextAssets,
  listUserVoices: mockListUserVoices,
  listAvailableVoices: mockListAvailableVoices,
  getVoiceSampleUrl: mockGetVoiceSampleUrl,
}));

import { SchemaFieldInput } from './SchemaFieldInput';

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PROJECT_CTX = { kind: 'project' as const, id: 'p1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContextAssets.mockResolvedValue([]);
  mockListUserVoices.mockResolvedValue([]);
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam-preview.mp3');
});

describe('SchemaFieldInput', () => {
  it('renders a text input for string fields and reports onChange per keystroke', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'aspect_ratio',
      type: 'string',
      label: 'Aspect Ratio',
      required: false,
    };
    renderWithClient(
      <SchemaFieldInput field={field} value="" onChange={handleChange} context={PROJECT_CTX} />,
    );
    const input = screen.getByLabelText('Aspect Ratio');
    await user.type(input, 'a');
    // The input is fully controlled; each keystroke fires onChange with the
    // new single-character value. Parent state lifts this up in real usage.
    expect(handleChange).toHaveBeenCalledWith('a');
  });

  it('renders a textarea for text fields', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'prompt',
      type: 'text',
      label: 'Prompt',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput field={field} value="" onChange={handleChange} context={PROJECT_CTX} />,
    );
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    await user.type(textarea, 'A');
    expect(handleChange).toHaveBeenCalledWith('A');
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('renders a numeric input for number fields and emits numbers', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'num_images',
      type: 'number',
      label: 'Number of Images',
      required: false,
      min: 1,
      max: 4,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    const input = screen.getByLabelText('Number of Images') as HTMLInputElement;
    expect(input.type).toBe('number');
    await user.type(input, '3');
    expect(handleChange).toHaveBeenLastCalledWith(3);
  });

  it('renders a checkbox for boolean fields', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'generate_audio',
      type: 'boolean',
      label: 'Generate Audio',
      required: false,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={false}
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('renders a select for enum fields', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'resolution',
      type: 'enum',
      label: 'Resolution',
      required: true,
      enum: ['360p', '720p', '1080p'],
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value="360p"
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    const select = screen.getByLabelText('Resolution') as HTMLSelectElement;
    await user.selectOptions(select, '1080p');
    expect(handleChange).toHaveBeenCalledWith('1080p');
  });
});
