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

import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    fetchMySettings()
      .then((settings) => {
        if (!cancelled) setStoredInterval(settings.autosaveIntervalSeconds);
      })
      .catch(() => {
        // AC-11b: read failure → keep the 1-minute default, never block.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    </div>
  );
}
