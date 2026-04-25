import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useScopeToggle } from './useScopeToggle';

describe('useScopeToggle', () => {
  it('defaults to project scope', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: false, isEmpty: false }),
    );
    expect(result.current.scope).toBe('project');
  });

  it('does not auto-switch when not settled', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: false, isEmpty: true }),
    );
    expect(result.current.scope).toBe('project');
  });

  it('auto-switches to all on first settled empty load', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: true, isEmpty: true }),
    );
    expect(result.current.scope).toBe('all');
  });

  it('does not auto-switch when settled but non-empty', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: true, isEmpty: false }),
    );
    expect(result.current.scope).toBe('project');
  });

  it('does not re-switch after already auto-switched', () => {
    const props = { isSettled: true, isEmpty: true };
    const { result, rerender } = renderHook((p) => useScopeToggle(p), {
      initialProps: props,
    });
    expect(result.current.scope).toBe('all');

    // Simulate data arriving — isEmpty becomes false but scope should stay 'all'
    rerender({ isSettled: true, isEmpty: false });
    expect(result.current.scope).toBe('all');
  });

  it('toggleScope switches from project to all', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: false, isEmpty: false }),
    );
    expect(result.current.scope).toBe('project');

    act(() => result.current.toggleScope());
    expect(result.current.scope).toBe('all');
  });

  it('toggleScope switches from all back to project', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: false, isEmpty: false }),
    );

    act(() => result.current.toggleScope());
    expect(result.current.scope).toBe('all');

    act(() => result.current.toggleScope());
    expect(result.current.scope).toBe('project');
  });

  it('setScope allows direct assignment', () => {
    const { result } = renderHook(() =>
      useScopeToggle({ isSettled: false, isEmpty: false }),
    );
    act(() => result.current.setScope('all'));
    expect(result.current.scope).toBe('all');
  });
});
