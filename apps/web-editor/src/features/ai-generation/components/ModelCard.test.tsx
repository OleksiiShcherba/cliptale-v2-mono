import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FalModel } from '@/features/ai-generation/types';

import { ModelCard } from './ModelCard';

const FIXTURE_MODEL: FalModel = {
  id: 'fal-ai/nano-banana-2',
  capability: 'text_to_image',
  label: 'Nano Banana 2 — Text to Image',
  description: 'Nano Banana 2 text-to-image with extreme aspect ratios.',
  inputSchema: { fields: [] },
};

describe('ModelCard', () => {
  it('renders label and description', () => {
    render(<ModelCard model={FIXTURE_MODEL} selected={false} onSelect={() => undefined} />);
    expect(screen.getByText('Nano Banana 2 — Text to Image')).toBeTruthy();
    expect(
      screen.getByText('Nano Banana 2 text-to-image with extreme aspect ratios.'),
    ).toBeTruthy();
  });

  it('reports selected=true via aria-pressed', () => {
    render(<ModelCard model={FIXTURE_MODEL} selected={true} onSelect={() => undefined} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('reports selected=false via aria-pressed when not selected', () => {
    render(<ModelCard model={FIXTURE_MODEL} selected={false} onSelect={() => undefined} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
  });

  it('fires onSelect with the model id on click', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(<ModelCard model={FIXTURE_MODEL} selected={false} onSelect={handleSelect} />);

    await user.click(screen.getByRole('button'));
    expect(handleSelect).toHaveBeenCalledWith('fal-ai/nano-banana-2');
  });
});
