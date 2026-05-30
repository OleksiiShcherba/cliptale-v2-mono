import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { StoryboardStatusMenu } from './StoryboardStatusMenu';

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof StoryboardStatusMenu>> = {},
) {
  const props = {
    isOwner: true,
    label: 'Generated scenes applied',
    onRegenerate: vi.fn(),
    onHide: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<StoryboardStatusMenu {...props} />) };
}

describe('StoryboardStatusMenu', () => {
  it('renders nothing for a non-owner (AC-09)', () => {
    renderMenu({ isOwner: false });
    expect(screen.queryByTestId('storyboard-status-menu-trigger')).toBeNull();
  });

  it('exposes a keyboard-reachable kebab trigger for the owner', () => {
    renderMenu();
    const trigger = screen.getByTestId('storyboard-status-menu-trigger') as HTMLButtonElement;
    // In the tab order (native button, not removed via tabindex=-1).
    expect(trigger.tabIndex).not.toBe(-1);
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Menu is closed until activated.
    expect(screen.queryByTestId('storyboard-status-menu')).toBeNull();
  });

  it('opens the menu on trigger activation and lists Regenerate + Hide', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('storyboard-status-menu-trigger'));

    const menu = screen.getByTestId('storyboard-status-menu');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(screen.getByTestId('storyboard-status-menu-trigger').getAttribute('aria-expanded')).toBe('true');

    const regenerate = screen.getByTestId('storyboard-status-menu-regenerate');
    const hide = screen.getByTestId('storyboard-status-menu-hide');
    expect(regenerate.getAttribute('role')).toBe('menuitem');
    expect(hide.getAttribute('role')).toBe('menuitem');
    // Reachable by Tab — native buttons, not removed from the tab order.
    expect((regenerate as HTMLButtonElement).tabIndex).not.toBe(-1);
    expect((hide as HTMLButtonElement).tabIndex).not.toBe(-1);
  });

  it('invokes onRegenerate when Regenerate is activated by keyboard (Enter/Space via native button)', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByTestId('storyboard-status-menu-trigger'));
    // Native <button> fires onClick for Enter/Space — assert the handler wiring.
    fireEvent.click(screen.getByTestId('storyboard-status-menu-regenerate'));
    expect(props.onRegenerate).toHaveBeenCalledTimes(1);
    expect(props.onHide).not.toHaveBeenCalled();
  });

  it('invokes onHide when Hide is activated, and closes the menu', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByTestId('storyboard-status-menu-trigger'));
    fireEvent.click(screen.getByTestId('storyboard-status-menu-hide'));
    expect(props.onHide).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('storyboard-status-menu')).toBeNull();
  });

  it('closes the menu on Escape without firing an action', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByTestId('storyboard-status-menu-trigger'));
    expect(screen.getByTestId('storyboard-status-menu')).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId('storyboard-status-menu'), { key: 'Escape' });
    expect(screen.queryByTestId('storyboard-status-menu')).toBeNull();
    expect(props.onRegenerate).not.toHaveBeenCalled();
    expect(props.onHide).not.toHaveBeenCalled();
    // Focus returns to the trigger so keyboard users are not stranded.
    expect(document.activeElement).toBe(screen.getByTestId('storyboard-status-menu-trigger'));
  });
});
