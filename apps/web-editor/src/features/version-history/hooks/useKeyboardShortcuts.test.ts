import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerKeyDown(key: string, options: Partial<KeyboardEventInit> = {}): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options });
  document.dispatchEvent(event);
}

/**
 * Dispatches a spied KeyboardEvent so tests can assert that
 * `event.preventDefault()` was called by the handler.
 */
function triggerKeyDownWithSpy(
  key: string,
  options: Partial<KeyboardEventInit> = {},
): { preventDefaultSpy: ReturnType<typeof vi.fn> } {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
  document.dispatchEvent(event);
  return { preventDefaultSpy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useKeyboardShortcuts', () => {
  let onUndo: ReturnType<typeof vi.fn>;
  let onRedo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUndo = vi.fn();
    onRedo = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Undo ──────────────────────────────────────────────────────────────────

  it('calls onUndo when Ctrl+Z is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('z', { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('calls preventDefault when Ctrl+Z is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    const { preventDefaultSpy } = triggerKeyDownWithSpy('z', { ctrlKey: true });
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
  });

  it('calls onUndo when Meta+Z (Mac) is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('z', { metaKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('calls preventDefault when Meta+Z is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    const { preventDefaultSpy } = triggerKeyDownWithSpy('z', { metaKey: true });
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
  });

  it('does not call onUndo when Z is pressed without Ctrl/Meta', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('z');
    expect(onUndo).not.toHaveBeenCalled();
  });

  // ── Redo ──────────────────────────────────────────────────────────────────

  it('calls onRedo when Ctrl+Y is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('y', { ctrlKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('calls preventDefault when Ctrl+Y is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    const { preventDefaultSpy } = triggerKeyDownWithSpy('y', { ctrlKey: true });
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
  });

  it('calls onRedo when Ctrl+Shift+Z is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('z', { ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('calls preventDefault when Ctrl+Shift+Z is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    const { preventDefaultSpy } = triggerKeyDownWithSpy('z', { ctrlKey: true, shiftKey: true });
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
  });

  it('calls onRedo when Meta+Y (Mac) is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('y', { metaKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('calls preventDefault when Meta+Y is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    const { preventDefaultSpy } = triggerKeyDownWithSpy('y', { metaKey: true });
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
  });

  it('does not call onRedo when Y is pressed without Ctrl/Meta', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('y');
    expect(onRedo).not.toHaveBeenCalled();
  });

  // ── No cross-firing ───────────────────────────────────────────────────────

  it('does not call onRedo when Ctrl+Z (undo) is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('z', { ctrlKey: true });
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('does not call onUndo when Ctrl+Y (redo) is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    triggerKeyDown('y', { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  it('removes the event listener on unmount and stops responding to keydown events', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onUndo, onRedo }));
    unmount();
    triggerKeyDown('z', { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });
});
