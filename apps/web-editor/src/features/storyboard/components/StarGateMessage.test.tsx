/**
 * Tests for StarGateMessage (storyboard-reference-flows T20, AC-08).
 *
 * AC-08 (star gate, domain invariant): when at least one reference block has no
 * starred result and the Creator attempts to start the full scene-preview set,
 * the system blocks the start and names, in plain language, exactly which blocks
 * still need a starred result.
 *
 * Component-level tests (component level, per test-plan.md AC-08 row):
 * 1. Renders every block name from the API error details (plain-language listing).
 * 2. Renders both exit actions: retry generation and delete block — per block.
 * 3. Clicking the retry action calls onRetryBlock with the block id.
 * 4. Clicking the delete action calls onDeleteBlock with the block id.
 * 5. Multiple unstarred blocks are all listed.
 * 6. Component renders nothing when blocks list is empty (gate passed).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StarGateMessage } from './StarGateMessage';

/** Matches the `details.blocks` shape from the star_gate_failed 422 response (openapi.yaml). */
interface GatedBlock {
  blockId: string;
  name: string;
}

function renderGate(
  blocks: GatedBlock[],
  callbacks: {
    onRetryBlock?: (blockId: string) => void;
    onDeleteBlock?: (blockId: string) => void;
  } = {},
): void {
  render(
    <StarGateMessage
      blocks={blocks}
      onRetryBlock={callbacks.onRetryBlock ?? vi.fn()}
      onDeleteBlock={callbacks.onDeleteBlock ?? vi.fn()}
    />,
  );
}

describe('StarGateMessage — AC-08 (star gate)', () => {
  it('renders each block name from the API error details in plain language', () => {
    renderGate([
      { blockId: 'block-1', name: 'Test Character' },
      { blockId: 'block-2', name: 'Test Environment' },
    ]);

    expect(screen.getByText(/Test Character/)).toBeTruthy();
    expect(screen.getByText(/Test Environment/)).toBeTruthy();
  });

  it('renders both exit actions — retry and delete — for each gated block', () => {
    renderGate([
      { blockId: 'block-1', name: 'Test Character' },
    ]);

    expect(screen.getByTestId('star-gate-retry-block-1')).toBeTruthy();
    expect(screen.getByTestId('star-gate-delete-block-1')).toBeTruthy();
  });

  it('calls onRetryBlock with the block id when the retry action is clicked', () => {
    const onRetryBlock = vi.fn();
    renderGate(
      [{ blockId: 'block-retry-1', name: 'Test Character' }],
      { onRetryBlock },
    );

    fireEvent.click(screen.getByTestId('star-gate-retry-block-retry-1'));
    expect(onRetryBlock).toHaveBeenCalledTimes(1);
    expect(onRetryBlock).toHaveBeenCalledWith('block-retry-1');
  });

  it('calls onDeleteBlock with the block id when the delete action is clicked', () => {
    const onDeleteBlock = vi.fn();
    renderGate(
      [{ blockId: 'block-del-1', name: 'Test Environment' }],
      { onDeleteBlock },
    );

    fireEvent.click(screen.getByTestId('star-gate-delete-block-del-1'));
    expect(onDeleteBlock).toHaveBeenCalledTimes(1);
    expect(onDeleteBlock).toHaveBeenCalledWith('block-del-1');
  });

  it('lists all unstarred blocks when multiple are gated', () => {
    const blocks: GatedBlock[] = [
      { blockId: 'b-1', name: 'Hero' },
      { blockId: 'b-2', name: 'Sidekick' },
      { blockId: 'b-3', name: 'Villain' },
    ];
    renderGate(blocks);

    for (const { blockId, name } of blocks) {
      expect(screen.getByText(new RegExp(name))).toBeTruthy();
      expect(screen.getByTestId(`star-gate-retry-${blockId}`)).toBeTruthy();
      expect(screen.getByTestId(`star-gate-delete-${blockId}`)).toBeTruthy();
    }
  });

  it('renders nothing when the blocks list is empty (gate passed)', () => {
    const { container } = render(
      <StarGateMessage blocks={[]} onRetryBlock={vi.fn()} onDeleteBlock={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
