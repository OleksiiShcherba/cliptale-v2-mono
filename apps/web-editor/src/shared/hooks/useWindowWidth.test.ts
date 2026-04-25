import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useWindowWidth } from './useWindowWidth';

describe('useWindowWidth', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('returns the current window.innerWidth on initial render', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(1024);
  });

  it('updates when window is resized', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1440,
    });

    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(1440);

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe(375);
  });

  it('returns a value below 768 for narrow viewport (mobile detection)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 390,
    });

    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBeLessThan(768);
  });

  it('removes the resize listener on unmount (no stale subscriptions)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useWindowWidth());
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('handles multiple sequential resize events correctly', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1440,
    });

    const { result } = renderHook(() => useWindowWidth());

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 768 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(768);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(390);
  });
});
