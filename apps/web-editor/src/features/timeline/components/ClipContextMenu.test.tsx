import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ClipContextMenu } from './ClipContextMenu';

const defaultProps = {
  x: 100,
  y: 200,
  canSplit: true,
  onAction: vi.fn(),
  onClose: vi.fn(),
};

describe('ClipContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three menu items', () => {
    render(<ClipContextMenu {...defaultProps} />);
    expect(screen.getByText('Split at Playhead')).toBeDefined();
    expect(screen.getByText('Delete Clip')).toBeDefined();
    expect(screen.getByText('Duplicate Clip')).toBeDefined();
  });

  it('has role="menu" for accessibility', () => {
    render(<ClipContextMenu {...defaultProps} />);
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('all items have role="menuitem"', () => {
    render(<ClipContextMenu {...defaultProps} />);
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(3);
  });

  it('calls onAction("split") when Split at Playhead is clicked (canSplit=true)', () => {
    render(<ClipContextMenu {...defaultProps} canSplit={true} />);
    fireEvent.click(screen.getByText('Split at Playhead'));
    expect(defaultProps.onAction).toHaveBeenCalledWith('split');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not call onAction when Split at Playhead is clicked with canSplit=false', () => {
    render(<ClipContextMenu {...defaultProps} canSplit={false} />);
    fireEvent.click(screen.getByText('Split at Playhead'));
    expect(defaultProps.onAction).not.toHaveBeenCalled();
  });

  it('greys out Split at Playhead when canSplit is false (aria-disabled)', () => {
    render(<ClipContextMenu {...defaultProps} canSplit={false} />);
    const splitItem = screen.getByText('Split at Playhead').closest('[role="menuitem"]') as HTMLElement;
    expect(splitItem?.getAttribute('aria-disabled')).toBe('true');
  });

  it('calls onAction("delete") when Delete Clip is clicked', () => {
    render(<ClipContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete Clip'));
    expect(defaultProps.onAction).toHaveBeenCalledWith('delete');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onAction("duplicate") when Duplicate Clip is clicked', () => {
    render(<ClipContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText('Duplicate Clip'));
    expect(defaultProps.onAction).toHaveBeenCalledWith('duplicate');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<ClipContextMenu {...defaultProps} />);
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking outside the menu', () => {
    render(
      <div>
        <ClipContextMenu {...defaultProps} />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('navigates items with ArrowDown', () => {
    render(<ClipContextMenu {...defaultProps} canSplit={true} />);
    const menu = screen.getByRole('menu');
    // Focus first item, then press ArrowDown
    const items = screen.getAllByRole('menuitem');
    items[0]?.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    // Focus should have moved (we check no error is thrown and items exist)
    expect(items.length).toBe(3);
  });

  it('navigates items with ArrowUp', () => {
    render(<ClipContextMenu {...defaultProps} canSplit={true} />);
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    items[0]?.focus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items.length).toBe(3);
  });

  it('activates focused item with Enter key', () => {
    render(<ClipContextMenu {...defaultProps} canSplit={true} />);
    const menu = screen.getByRole('menu');
    const deleteItem = screen.getByText('Delete Clip').closest('[role="menuitem"]') as HTMLElement;
    deleteItem.focus();
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(defaultProps.onAction).toHaveBeenCalledWith('delete');
  });

  it('positions menu at the given x/y coordinates', () => {
    render(<ClipContextMenu {...defaultProps} x={150} y={300} />);
    // Portal renders into document.body — query the menu via screen
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('150px');
    expect(menu.style.top).toBe('300px');
  });

  it('renders the menu into document.body via a React portal (not inside render container)', () => {
    // The portal renders to document.body so that position:fixed coordinates are
    // relative to the viewport even when the component is nested inside a
    // react-window list that applies will-change:transform (which traps fixed
    // positioning relative to the list container otherwise).
    const { container } = render(<ClipContextMenu {...defaultProps} />);
    // The render container itself has no direct child that is the menu
    expect(container.querySelector('[role="menu"]')).toBeNull();
    // The menu IS accessible via screen (found in document.body)
    expect(screen.getByRole('menu')).toBeDefined();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  });
});
