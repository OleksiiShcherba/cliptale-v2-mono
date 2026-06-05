/**
 * Tests for useCheckpointScheduler (storyboard-autosave-checkpoints T10).
 *
 * Fake-timer unit tests, one per AC:
 * - AC-03  — the interval elapsing with pending changes fires one checkpoint
 * - AC-03b — drag/typing defers the automatic fire until the interaction ends,
 *            capped at ONE extra interval (fires anyway at the cap)
 * - AC-03c — deadline passed while the tab was hidden → one overdue checkpoint
 *            within 10 s of visibility return, then the countdown resumes
 * - AC-05  — no changes → idle, zero checkpoints, Save inactive
 * - AC-06  — countdown resets after every checkpoint; the first change after
 *            idle starts a fresh full-interval countdown
 * - AC-07  — manual save fires immediately, never deferred by interaction
 * - AC-07b — double-save guard: while inFlight a second start is impossible
 * - AC-11b — settings read failure → session default 60 s, never blocks
 * - cleanup — no timers keep ticking after unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockFetchMySettings } = vi.hoisted(() => ({
  mockFetchMySettings: vi.fn<[], Promise<{ autosaveIntervalSeconds: number; updatedAt: string | null }>>(),
}));

vi.mock('@/features/settings/api', () => ({
  fetchMySettings: mockFetchMySettings,
  DEFAULT_AUTOSAVE_INTERVAL_SECONDS: 60,
}));

import {
  useCheckpointScheduler,
  OVERDUE_FIRE_DELAY_MS,
  type UseCheckpointSchedulerOptions,
} from './useCheckpointScheduler';

// ── Helpers ────────────────────────────────────────────────────────────────────

let visibilityState: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState): void {
  visibilityState = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

type HookProps = UseCheckpointSchedulerOptions;

function defaultProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    changeCounter: 0,
    isInteracting: false,
    inFlight: false,
    pushCheckpoint: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function renderScheduler(initial: Partial<HookProps> = {}) {
  let props = defaultProps(initial);
  const view = renderHook((p: HookProps) => useCheckpointScheduler(p), {
    initialProps: props,
  });
  return {
    ...view,
    update(next: Partial<HookProps>) {
      props = { ...props, ...next };
      view.rerender(props);
    },
    get props() {
      return props;
    },
  };
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibilityState = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibilityState,
  });
  // Default: stored interval = 60 s.
  mockFetchMySettings.mockResolvedValue({ autosaveIntervalSeconds: 60, updatedAt: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── AC-03 — interval fire ──────────────────────────────────────────────────────

describe('AC-03 — interval elapses with pending changes', () => {
  it('fires exactly one automatic checkpoint at the deadline', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush(); // settings load

    view.update({ changeCounter: 1 });
    await flush(59_000);
    expect(pushCheckpoint).not.toHaveBeenCalled();

    await flush(1_500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
  });
});

// ── AC-03b — deferral + cap ────────────────────────────────────────────────────

describe('AC-03b — active interaction defers the automatic fire', () => {
  it('defers past the deadline and fires immediately when the interaction ends', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1, isInteracting: true });
    await flush(61_000);
    expect(pushCheckpoint).not.toHaveBeenCalled(); // deferred mid-drag

    view.update({ isInteracting: false });
    await flush(500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1); // immediately afterwards
  });

  it('caps the deferral at ONE extra interval — fires even mid-interaction', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1, isInteracting: true });
    // Deadline (60 s) + almost one extra interval — still deferred.
    await flush(60_000 + 59_000);
    expect(pushCheckpoint).not.toHaveBeenCalled();

    // The cap lands at deadline + one full extra interval.
    await flush(1_500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('a manual save is never deferred by the same interaction (AC-03b tail)', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1, isInteracting: true });
    await flush(1_000);

    await act(async () => {
      await view.result.current.triggerManualSave();
    });
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
  });
});

// ── AC-03c — overdue on visibility return ──────────────────────────────────────

describe('AC-03c — deadline passed while hidden → overdue fire on return', () => {
  it('does not fire while hidden; fires within 10 s of becoming visible', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1 });
    await flush(1_000);

    act(() => setVisibility('hidden'));
    await flush(120_000); // two intervals pass in the background
    expect(pushCheckpoint).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    await flush(OVERDUE_FIRE_DELAY_MS + 500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
    expect(OVERDUE_FIRE_DELAY_MS).toBeLessThanOrEqual(10_000);
  });

  it('the regular countdown resumes after the overdue checkpoint', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1 });
    act(() => setVisibility('hidden'));
    await flush(120_000);
    act(() => setVisibility('visible'));
    await flush(OVERDUE_FIRE_DELAY_MS + 500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);

    // New change → fresh full countdown, fires once more at its own deadline.
    view.update({ changeCounter: 2 });
    await flush(60_500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(2);
  });
});

// ── AC-05 — no idle checkpoints ────────────────────────────────────────────────

describe('AC-05 — idle state creates nothing', () => {
  it('without changes: idle, no fire ever, Save inactive', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    await flush(300_000); // five intervals
    expect(pushCheckpoint).not.toHaveBeenCalled();
    expect(view.result.current.idle).toBe(true);
    expect(view.result.current.remainingMs).toBeNull();
    expect(view.result.current.canSaveNow).toBe(false);
  });

  it('a manual save in idle is refused (nothing to duplicate)', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await view.result.current.triggerManualSave();
    });
    expect(ok).toBe(false);
    expect(pushCheckpoint).not.toHaveBeenCalled();
  });
});

// ── AC-06 — countdown visibility + reset ───────────────────────────────────────

describe('AC-06 — countdown counts and resets', () => {
  it('the first change after idle starts a fresh full-interval countdown', async () => {
    const view = renderScheduler();
    await flush();
    expect(view.result.current.idle).toBe(true);

    view.update({ changeCounter: 1 });
    await flush(1_000);
    expect(view.result.current.idle).toBe(false);
    const remaining = view.result.current.remainingMs;
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeGreaterThan(58_000);
    expect(remaining!).toBeLessThanOrEqual(60_000);
  });

  it('resets after an automatic checkpoint and counts anew on the next change', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1 });
    await flush(60_500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
    // Saved and unchanged → idle (reset), not a runaway countdown.
    expect(view.result.current.idle).toBe(true);

    view.update({ changeCounter: 2 });
    await flush(1_000);
    expect(view.result.current.remainingMs).toBeGreaterThan(58_000);
  });

  it('resets after a manual checkpoint too', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1 });
    await flush(30_000);

    await act(async () => {
      await view.result.current.triggerManualSave();
    });
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
    expect(view.result.current.idle).toBe(true);

    view.update({ changeCounter: 2 });
    await flush(1_000);
    expect(view.result.current.remainingMs).toBeGreaterThan(58_000);
  });
});

// ── AC-07 — manual save immediate ──────────────────────────────────────────────

describe('AC-07 — manual save runs at once', () => {
  it('fires immediately with pending changes, even mid-countdown', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    view.update({ changeCounter: 1 });
    await flush(10_000);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await view.result.current.triggerManualSave();
    });
    expect(ok).toBe(true);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
  });
});

// ── AC-07b — double-save guard ─────────────────────────────────────────────────

describe('AC-07b — double-save protection', () => {
  it('refuses a manual save while a checkpoint is in flight', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint, inFlight: true });
    await flush();

    view.update({ changeCounter: 1 });
    await flush(1_000);
    expect(view.result.current.canSaveNow).toBe(false);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await view.result.current.triggerManualSave();
    });
    expect(ok).toBe(false);
    expect(pushCheckpoint).not.toHaveBeenCalled();
  });

  it('holds the automatic fire while inFlight and fires after it clears', async () => {
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint, inFlight: true });
    await flush();

    view.update({ changeCounter: 1 });
    await flush(61_000);
    expect(pushCheckpoint).not.toHaveBeenCalled();

    view.update({ inFlight: false });
    await flush(500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
  });
});

// ── AC-11b — settings read failure ─────────────────────────────────────────────

describe('AC-11b — settings read failure falls back to 60 s for the session', () => {
  it('uses the 1-minute default and keeps scheduling', async () => {
    mockFetchMySettings.mockRejectedValue(new Error('api down'));
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    expect(view.result.current.intervalSeconds).toBe(60);

    view.update({ changeCounter: 1 });
    await flush(60_500);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('a stored interval is respected when the read succeeds', async () => {
    mockFetchMySettings.mockResolvedValue({ autosaveIntervalSeconds: 120, updatedAt: 'x' });
    const pushCheckpoint = vi.fn().mockResolvedValue(true);
    const view = renderScheduler({ pushCheckpoint });
    await flush();

    expect(view.result.current.intervalSeconds).toBe(120);

    view.update({ changeCounter: 1 });
    await flush(61_000);
    expect(pushCheckpoint).not.toHaveBeenCalled(); // 60 s is not enough
    await flush(60_000);
    expect(pushCheckpoint).toHaveBeenCalledTimes(1); // fires at 120 s
  });
});

// ── Cleanup ────────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('leaves no ticking timers after unmount', async () => {
    const view = renderScheduler();
    await flush();
    view.update({ changeCounter: 1 });
    await flush(1_000);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
