/**
 * useCheckpointScheduler — the client-owned checkpoint scheduler
 * (storyboard-autosave-checkpoints, ADR-0002). Owns the WHOLE checkpoint
 * cadence; the push itself is delegated to the checkpoint push client (T9).
 *
 * Behaviour map:
 * - AC-03  — with changes newer than the last checkpoint, a countdown runs and
 *   one automatic checkpoint fires at the deadline.
 * - AC-03b — a deadline landing mid drag/typing is deferred until the
 *   interaction ends, capped at ONE extra interval; at the cap it fires as-is.
 *   The deferral applies to automatic checkpoints only.
 * - AC-03c — a deadline passing while the tab is hidden does NOT fire (the
 *   capture needs a visible canvas); one overdue checkpoint runs within 10 s
 *   of visibility return, then the regular cadence resumes.
 * - AC-05  — no pending changes → idle: no countdown, no checkpoint, manual
 *   save refused (nothing to duplicate).
 * - AC-06  — the countdown resets after every checkpoint (automatic or
 *   manual); the first change after idle starts a fresh full interval.
 * - AC-07  — triggerManualSave() fires at once, never deferred.
 * - AC-07b — double-save guard: while a push is in flight no second start is
 *   possible (manual refused, automatic held until the flight clears).
 * - AC-11b — the account interval is read once on mount; a failed read falls
 *   back to the 60 s session default and never blocks editing. A stored
 *   change applies from the NEXT countdown start (AC-09 client side).
 *
 * Multi-tab: last-writer-wins, deliberately no cross-tab guard (ADR-0002).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
  fetchMySettings,
} from '@/features/settings/api';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Scheduler tick — drives the visible countdown and deadline checks. */
const TICK_MS = 250;

/**
 * Delay between the tab becoming visible with overdue changes and the overdue
 * checkpoint firing (AC-03c allows up to 10 s; one second lets the canvas
 * paint before the screenshot capture).
 */
export const OVERDUE_FIRE_DELAY_MS = 1_000;

// ── Types ──────────────────────────────────────────────────────────────────────

export type UseCheckpointSchedulerOptions = {
  /** Monotonic counter incremented by the page on every canvas change. */
  changeCounter: number;
  /** True while the user is dragging a block or typing on the canvas. */
  isInteracting: boolean;
  /** True while the checkpoint push client (T9) has a push in flight. */
  inFlight: boolean;
  /** Fires one checkpoint push; resolves true on success. */
  pushCheckpoint: () => Promise<boolean>;
};

export type UseCheckpointSchedulerResult = {
  /** True when there is nothing to checkpoint — the "all saved" state. */
  idle: boolean;
  /** Ms left in the running countdown, or null when not counting. */
  remainingMs: number | null;
  /** The effective interval (account setting, or the 60 s session default). */
  intervalSeconds: number;
  /** True when a manual save would be accepted right now. */
  canSaveNow: boolean;
  /** Manual checkpoint (AC-07): immediate, undeferred; false when refused. */
  triggerManualSave: () => Promise<boolean>;
};

export function useCheckpointScheduler(
  options: UseCheckpointSchedulerOptions,
): UseCheckpointSchedulerResult {
  const { changeCounter, isInteracting, inFlight, pushCheckpoint } = options;

  const [intervalSeconds, setIntervalSeconds] = useState(
    DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
  );
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  // Re-render trigger for idle/canSaveNow transitions driven by refs.
  const [, setStateTick] = useState(0);

  // ── Mutable scheduler state ──────────────────────────────────────────────────
  const intervalSecondsRef = useRef(intervalSeconds);
  const changeCounterRef = useRef(changeCounter);
  const isInteractingRef = useRef(isInteracting);
  const inFlightRef = useRef(inFlight);
  const pushCheckpointRef = useRef(pushCheckpoint);

  /** changeCounter value covered by the last successful checkpoint. */
  const lastSavedCounterRef = useRef(changeCounter);
  /** Deadline (epoch ms) of the running countdown; null = not counting. */
  const deadlineRef = useRef<number | null>(null);
  /** Deferral cap (epoch ms) once a deadline landed mid-interaction. */
  const deferralCapRef = useRef<number | null>(null);
  /** Deadline passed while the tab was hidden — fire on visibility return. */
  const overdueWhileHiddenRef = useRef(false);
  /** A fire is being executed right now (capture + POST). */
  const firingRef = useRef(false);
  /** Deadline reached while a push was in flight — fire when it clears. */
  const pendingFireRef = useRef(false);

  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overdueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  intervalSecondsRef.current = intervalSeconds;
  changeCounterRef.current = changeCounter;
  isInteractingRef.current = isInteracting;
  inFlightRef.current = inFlight;
  pushCheckpointRef.current = pushCheckpoint;

  const isDirty = useCallback(
    (): boolean => changeCounterRef.current > lastSavedCounterRef.current,
    [],
  );

  // ── Settings read (AC-11b) ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchMySettings()
      .then((settings) => {
        if (!cancelled) setIntervalSeconds(settings.autosaveIntervalSeconds);
      })
      .catch(() => {
        // Session default stays at 60 s; scheduling continues unblocked.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Core fire ────────────────────────────────────────────────────────────────

  const stopCountdown = useCallback((): void => {
    deadlineRef.current = null;
    deferralCapRef.current = null;
    pendingFireRef.current = false;
    overdueWhileHiddenRef.current = false;
    setRemainingMs(null);
  }, []);

  const startCountdown = useCallback((): void => {
    deadlineRef.current = Date.now() + intervalSecondsRef.current * 1_000;
    deferralCapRef.current = null;
    setRemainingMs(intervalSecondsRef.current * 1_000);
  }, []);

  const fire = useCallback(async (): Promise<boolean> => {
    // Nothing to checkpoint (AC-05) or a save already running (AC-07b).
    if (!isDirty() || firingRef.current || inFlightRef.current) return false;
    firingRef.current = true;
    const counterAtStart = changeCounterRef.current;
    stopCountdown();
    setStateTick((t) => t + 1);

    let ok = false;
    try {
      ok = await pushCheckpointRef.current();
    } finally {
      firingRef.current = false;
      if (ok) {
        lastSavedCounterRef.current = counterAtStart;
      }
      // Reset (AC-06): new changes during/after the save → fresh full
      // countdown; a failed push keeps the state dirty → retry next interval.
      if (changeCounterRef.current > lastSavedCounterRef.current) {
        startCountdown();
      }
      setStateTick((t) => t + 1);
    }
    return ok;
  }, [startCountdown, stopCountdown]);

  // ── First change after idle starts a fresh countdown (AC-06) ────────────────

  useEffect(() => {
    if (
      isDirty() &&
      deadlineRef.current === null &&
      !firingRef.current
    ) {
      startCountdown();
    }
  }, [changeCounter, isDirty, startCountdown]);

  // ── Deadline tick ────────────────────────────────────────────────────────────

  useEffect(() => {
    tickTimerRef.current = setInterval(() => {
      const deadline = deadlineRef.current;
      if (deadline === null || firingRef.current) return;

      const now = Date.now();
      setRemainingMs(Math.max(0, deadline - now));
      if (now < deadline) return;

      // Deadline reached.
      if (document.visibilityState === 'hidden') {
        // AC-03c: never capture a hidden canvas — fire on visibility return.
        overdueWhileHiddenRef.current = true;
        return;
      }
      if (overdueWhileHiddenRef.current || overdueTimerRef.current !== null) {
        // The overdue path (visibility handler) owns this fire — don't race it.
        return;
      }
      if (inFlightRef.current) {
        // AC-07b: hold until the in-flight push clears.
        pendingFireRef.current = true;
        return;
      }
      if (isInteractingRef.current) {
        // AC-03b: defer to the interaction end, capped at one extra interval.
        if (deferralCapRef.current === null) {
          deferralCapRef.current = deadline + intervalSecondsRef.current * 1_000;
        }
        if (now < deferralCapRef.current) return;
        // Cap reached — fall through and fire as-is.
      }
      void fire();
    }, TICK_MS);

    return () => {
      if (tickTimerRef.current !== null) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [fire]);

  // ── Interaction end → immediate deferred fire (AC-03b) ──────────────────────

  useEffect(() => {
    if (!isInteracting && deferralCapRef.current !== null && !firingRef.current) {
      void fire();
    }
  }, [isInteracting, fire]);

  // ── In-flight cleared → held automatic fire (AC-07b) ────────────────────────

  useEffect(() => {
    if (!inFlight && pendingFireRef.current && !firingRef.current) {
      pendingFireRef.current = false;
      void fire();
    }
  }, [inFlight, fire]);

  // ── Visibility return → overdue fire within 10 s (AC-03c) ───────────────────

  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (
        document.visibilityState === 'visible' &&
        overdueWhileHiddenRef.current &&
        isDirty()
      ) {
        overdueWhileHiddenRef.current = false;
        overdueTimerRef.current = setTimeout(() => {
          overdueTimerRef.current = null;
          void fire();
        }, OVERDUE_FIRE_DELAY_MS);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (overdueTimerRef.current !== null) {
        clearTimeout(overdueTimerRef.current);
        overdueTimerRef.current = null;
      }
    };
  }, [fire, isDirty]);

  // ── Manual save (AC-07 / AC-07b) ─────────────────────────────────────────────

  const triggerManualSave = useCallback(async (): Promise<boolean> => {
    // AC-05: nothing to duplicate; AC-07b: no second start while in flight.
    if (!isDirty() || inFlightRef.current || firingRef.current) return false;
    // AC-07: a manual save ignores the interaction deferral entirely.
    return fire();
  }, [fire, isDirty]);

  // ── Derived UI state ─────────────────────────────────────────────────────────

  const dirty = changeCounter > lastSavedCounterRef.current;
  const idle = !dirty && !firingRef.current;
  const canSaveNow = dirty && !inFlight && !firingRef.current;

  return {
    idle,
    remainingMs: idle ? null : remainingMs,
    intervalSeconds,
    canSaveNow,
    triggerManualSave,
  };
}
