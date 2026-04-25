import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { UndoToast } from './UndoToast';
import type { UndoToastState } from './useUndoToast';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(label = 'Asset deleted', onUndo = vi.fn().mockResolvedValue(undefined)) {
  return { id: 'toast-1', label, onUndo };
}

function visibleState(label = 'Asset deleted', onUndo = vi.fn().mockResolvedValue(undefined)): UndoToastState {
  return { visible: true, entry: makeEntry(label, onUndo) };
}

function hiddenState(): UndoToastState {
  return { visible: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UndoToast', () => {
  describe('visibility', () => {
    it('renders nothing when toastState.visible is false', () => {
      const { container } = render(
        <UndoToast toastState={hiddenState()} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders the toast container when toastState.visible is true', () => {
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      expect(screen.getByRole('status')).toBeDefined();
    });

    it('renders the label text', () => {
      render(
        <UndoToast toastState={visibleState('My asset deleted')} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      expect(screen.getByText('My asset deleted')).toBeDefined();
    });
  });

  describe('Undo button', () => {
    it('renders an Undo button', () => {
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: /undo last action/i })).toBeDefined();
    });

    it('calls onUndo when Undo is clicked', async () => {
      const onUndo = vi.fn().mockResolvedValue(undefined);
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={onUndo} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /undo last action/i }));
      await waitFor(() => expect(onUndo).toHaveBeenCalledOnce());
    });

    it('shows "Undoing…" while the undo request is in-flight', async () => {
      let resolveUndo!: () => void;
      const onUndo = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveUndo = r; }));
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={onUndo} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /undo last action/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /undo last action/i }).textContent).toMatch(/undoing/i),
      );
      resolveUndo();
    });

    it('does not call onUndo a second time if already undoing', async () => {
      let resolveUndo!: () => void;
      const onUndo = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveUndo = r; }));
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={onUndo} />,
      );
      const btn = screen.getByRole('button', { name: /undo last action/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      resolveUndo();
      await waitFor(() => expect(onUndo).toHaveBeenCalledOnce());
    });
  });

  describe('Dismiss button', () => {
    it('renders a dismiss button', () => {
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: /dismiss notification/i })).toBeDefined();
    });

    it('calls onDismiss when dismiss is clicked', () => {
      const onDismiss = vi.fn();
      render(
        <UndoToast toastState={visibleState()} onDismiss={onDismiss} onUndo={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe('accessibility', () => {
    it('has role="status" and aria-live="polite"', () => {
      render(
        <UndoToast toastState={visibleState()} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      const el = screen.getByRole('status');
      expect(el.getAttribute('aria-live')).toBe('polite');
    });

    it('has aria-label describing the action', () => {
      render(
        <UndoToast toastState={visibleState('Photo deleted')} onDismiss={vi.fn()} onUndo={vi.fn()} />,
      );
      expect(screen.getByLabelText(/undo: photo deleted/i)).toBeDefined();
    });
  });
});
