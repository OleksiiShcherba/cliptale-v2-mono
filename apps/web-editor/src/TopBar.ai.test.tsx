import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/features/version-history/hooks/useAutosave', () => ({
  useAutosave: vi.fn().mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false }),
}));

vi.mock('./SaveStatusBadge', () => ({
  SaveStatusBadge: () => React.createElement('div', { 'data-testid': 'save-status-badge' }),
}));

import { TopBar } from './TopBar';
import { defaultProps } from './TopBar.fixtures';

describe('TopBar — AI Providers button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the AI Providers button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Toggle AI providers' })).toBeTruthy();
  });

  it('calls onToggleAiProviders when the AI button is clicked', () => {
    const onToggleAiProviders = vi.fn();
    render(<TopBar {...defaultProps} onToggleAiProviders={onToggleAiProviders} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle AI providers' }));
    expect(onToggleAiProviders).toHaveBeenCalledOnce();
  });

  it('sets aria-pressed="true" on the AI button when isAiProvidersOpen is true', () => {
    render(<TopBar {...defaultProps} isAiProvidersOpen={true} />);
    const btn = screen.getByRole('button', { name: 'Toggle AI providers' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed="false" on the AI button when isAiProvidersOpen is false', () => {
    render(<TopBar {...defaultProps} isAiProvidersOpen={false} />);
    const btn = screen.getByRole('button', { name: 'Toggle AI providers' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});
