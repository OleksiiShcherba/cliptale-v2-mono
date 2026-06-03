/**
 * NodeDeleteButton — renders the per-node delete affordance only when a delete handler
 * is wired (via FlowExtrasContext), and routes clicks to it.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FlowExtrasProvider, type FlowExtras } from './flowExtrasContext';
import { NodeDeleteButton } from './NodeDeleteButton';

describe('NodeDeleteButton', () => {
  it('renders nothing when no delete handler is wired (isolated render)', () => {
    const { container } = render(<NodeDeleteButton blockId="b1" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a × that calls onDelete for its block', () => {
    const onDelete = vi.fn();
    const extras: FlowExtras = {
      generation: () => ({}),
      result: () => ({}),
      nodeActions: (id) => ({ onDelete: id === 'b1' ? onDelete : undefined }),
    };
    render(
      <FlowExtrasProvider value={extras}>
        <NodeDeleteButton blockId="b1" />
      </FlowExtrasProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete block/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
