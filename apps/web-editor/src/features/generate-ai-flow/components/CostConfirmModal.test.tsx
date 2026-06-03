/**
 * CostConfirmModal — component test (T20 / AC-01, AC-11).
 *
 * Shows the best-effort estimated cost. Confirm calls onConfirm; Cancel calls
 * onCancel and triggers NO generate (the parent owns the api call — here we just
 * assert the buttons wire to the right callbacks and the cost is shown).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CostConfirmModal } from './CostConfirmModal';

const ESTIMATE = {
  flowId: 'f1',
  blockId: 'b1',
  modelId: 'fal-ai/x',
  estimate: { currency: 'USD', amount: 0.42 },
  bestEffort: true as const,
};

describe('CostConfirmModal', () => {
  it('shows the estimated cost and is a dialog', () => {
    render(<CostConfirmModal estimate={ESTIMATE} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/0\.42/)).toBeDefined();
    expect(screen.getByText(/USD/)).toBeDefined();
  });

  it('confirm calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(<CostConfirmModal estimate={ESTIMATE} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /generate|confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel calls onCancel and NOT onConfirm (AC-11)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<CostConfirmModal estimate={ESTIMATE} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a best-effort estimate hint', () => {
    render(<CostConfirmModal estimate={ESTIMATE} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/best-effort estimate/i)).toBeDefined();
  });
});
