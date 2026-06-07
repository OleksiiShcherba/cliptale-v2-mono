/**
 * SettingsPage — per-account preferences (storyboard-autosave-checkpoints, US-06).
 *
 * Shows the autosave-interval presets (30 s / 1 / 2 / 5 / 10 min). Picking a
 * preset stores it via PUT /users/me/settings:
 * - success → confirmation message, the new interval governs the NEXT
 *   countdown start on any of the user's boards (AC-09);
 * - failure → a "not saved" message and the previously stored interval stays
 *   selected (AC-11).
 * A failed initial read falls back to the 1-minute default and never blocks
 * the page (AC-11b surface).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AUTOSAVE_INTERVAL_PRESETS,
  DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
  fetchMySettings,
  updateMySettings,
} from '../api';

// ── Design-guide tokens (§3 Dark Theme — same palette as HomeSidebar) ────────
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const PRIMARY_LIGHT = '#4C1D95';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const SUCCESS = '#34D399';
const DANGER = '#F87171';

/** Default concurrency limit when the GET returns no value (AC-03). */
const DEFAULT_CONCURRENCY_LIMIT = 4;

/** Human label for each preset, used by tests and screen readers alike. */
export function presetLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saved' }
  | { kind: 'error' };

export function SettingsPage(): React.ReactElement {
  const navigate = useNavigate();

  const [storedInterval, setStoredInterval] = useState<number>(
    DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);

  // Concurrency limit state (AC-03)
  const [storedConcurrency, setStoredConcurrency] = useState<number>(DEFAULT_CONCURRENCY_LIMIT);
  const [concurrencyInput, setConcurrencyInput] = useState<string>(String(DEFAULT_CONCURRENCY_LIMIT));
  const [concurrencyStatus, setConcurrencyStatus] = useState<SaveStatus>({ kind: 'idle' });

  // Refs to avoid stale closure in the native blur handler (React onBlur maps to focusout;
  // the test dispatches a native 'blur' event, so we attach a native listener).
  const concurrencyInputRef = useRef<HTMLInputElement>(null);
  const storedConcurrencyRef = useRef<number>(DEFAULT_CONCURRENCY_LIMIT);
  storedConcurrencyRef.current = storedConcurrency;

  useEffect(() => {
    let cancelled = false;
    fetchMySettings()
      .then((settings) => {
        if (!cancelled) {
          setStoredInterval(settings.autosaveIntervalSeconds);
          const limit = settings.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
          setStoredConcurrency(limit);
          setConcurrencyInput(String(limit));
        }
      })
      .catch(() => {
        // AC-11b: read failure → keep the 1-minute default, never block.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Native blur handler — covers both React's synthetic onBlur (focusout) and
  // test-dispatched native 'blur' events (via the ref-attached listener below).
  const handleConcurrencyBlurNative = useCallback(async (e: Event): Promise<void> => {
    const target = e.target as HTMLInputElement;
    const rawValue = target.value;
    const parsed = parseInt(rawValue, 10);
    const stored = storedConcurrencyRef.current;
    if (isNaN(parsed) || parsed < 1 || parsed > 12) {
      setConcurrencyInput(String(stored));
      return;
    }
    if (parsed === stored) return;
    setConcurrencyStatus({ kind: 'idle' });
    try {
      await updateMySettings({ concurrencyLimit: parsed });
      storedConcurrencyRef.current = parsed;
      setStoredConcurrency(parsed);
      setConcurrencyStatus({ kind: 'saved' });
    } catch {
      setConcurrencyStatus({ kind: 'error' });
      setConcurrencyInput(String(stored));
    }
  }, []);

  // Attach native 'blur' listener to cover both React onBlur (focusout) and
  // raw blur dispatches from tests.
  useEffect(() => {
    const el = concurrencyInputRef.current;
    if (!el) return;
    el.addEventListener('blur', handleConcurrencyBlurNative);
    return () => {
      el.removeEventListener('blur', handleConcurrencyBlurNative);
    };
  }, [handleConcurrencyBlurNative]);

  const handlePick = async (seconds: number): Promise<void> => {
    if (saving || seconds === storedInterval) return;
    setSaving(true);
    setSaveStatus({ kind: 'idle' });
    try {
      const updated = await updateMySettings(seconds);
      setStoredInterval(updated.autosaveIntervalSeconds);
      setSaveStatus({ kind: 'saved' });
    } catch {
      // AC-11: keep showing the previously stored interval.
      setSaveStatus({ kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: SURFACE,
        color: TEXT_PRIMARY,
        fontFamily: 'Inter, sans-serif',
        padding: '32px 40px',
        overflowY: 'auto',
      }}
    >
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'transparent',
          border: 'none',
          color: TEXT_SECONDARY,
          fontSize: 14,
          cursor: 'pointer',
          padding: 0,
          marginBottom: 16,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        ← Back to Home
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 24px' }}>Settings</h1>

      <section
        aria-label="Autosave interval"
        style={{
          background: SURFACE_ALT,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 520,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          Storyboard autosave interval
        </h2>
        <p style={{ fontSize: 13, color: TEXT_SECONDARY, margin: '0 0 16px', lineHeight: '18px' }}>
          How often a screenshot checkpoint of your storyboard is saved to History.
          The new interval applies from the next countdown start.
        </p>

        <div role="radiogroup" aria-label="Autosave interval presets"
             style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AUTOSAVE_INTERVAL_PRESETS.map((seconds) => {
            const isSelected = seconds === storedInterval;
            return (
              <label
                key={seconds}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? PRIMARY_LIGHT : BORDER}`,
                  background: isSelected ? PRIMARY_LIGHT : 'transparent',
                  color: isSelected ? TEXT_PRIMARY : TEXT_SECONDARY,
                  fontSize: 14,
                  cursor: saving ? 'wait' : 'pointer',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="autosave-interval"
                  value={seconds}
                  checked={isSelected}
                  disabled={saving}
                  onChange={() => void handlePick(seconds)}
                  style={{ accentColor: PRIMARY_LIGHT }}
                />
                {presetLabel(seconds)}
              </label>
            );
          })}
        </div>

        <div aria-live="polite" style={{ minHeight: 20, marginTop: 12, fontSize: 13 }}>
          {saveStatus.kind === 'saved' && (
            <span style={{ color: SUCCESS }}>Saved — applies from the next countdown.</span>
          )}
          {saveStatus.kind === 'error' && (
            <span style={{ color: DANGER }}>
              The change was not saved. Your previous interval is still active.
            </span>
          )}
        </div>
      </section>

      <section
        aria-label="Reference generation concurrency"
        style={{
          background: SURFACE_ALT,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 520,
          marginTop: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          Reference generation concurrency limit
        </h2>
        <p style={{ fontSize: 13, color: TEXT_SECONDARY, margin: '0 0 16px', lineHeight: '18px' }}>
          Maximum number of reference image generations that run at the same time (1–12, default 4).
        </p>

        <input
          ref={concurrencyInputRef}
          data-testid="concurrency-limit-input"
          type="number"
          min={1}
          max={12}
          value={concurrencyInput}
          onChange={(e) => setConcurrencyInput(e.target.value)}
          style={{
            background: '#0D0D14',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: TEXT_PRIMARY,
            fontSize: 14,
            padding: '8px 12px',
            width: 80,
            fontFamily: 'Inter, sans-serif',
          }}
        />

        <div aria-live="polite" style={{ minHeight: 20, marginTop: 8, fontSize: 13 }}>
          {concurrencyStatus.kind === 'saved' && (
            <span data-testid="concurrency-limit-saved" style={{ color: SUCCESS }}>
              Saved.
            </span>
          )}
          {concurrencyStatus.kind === 'error' && (
            <span data-testid="concurrency-limit-error" style={{ color: DANGER }}>
              The change was not saved.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
