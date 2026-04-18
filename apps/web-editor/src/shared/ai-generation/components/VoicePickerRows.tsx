import { useState } from 'react';

import type { ElevenLabsVoice, UserVoice } from '@/shared/ai-generation/types';

import * as s from './voicePickerStyles';

/**
 * Sub-components for VoicePickerModal voice rows.
 *
 * Extracted from `VoicePickerModal.tsx` so the modal file stays under the
 * §9.7 300-line cap.
 *
 * Exports:
 *   - `UserVoiceRow`     — row for cloned voices from the user's library
 *   - `LibraryVoiceRow`  — row for ElevenLabs catalog voices with play/stop
 */

// ── UserVoiceRow ──────────────────────────────────────────────────────────────

/** Props for a single user (cloned) voice row. */
export interface UserVoiceRowProps {
  voice: UserVoice;
  isSelected: boolean;
  onSelect: () => void;
}

/** A single row in the "Your Voices" section. */
export function UserVoiceRow({ voice, isSelected, onSelect }: UserVoiceRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const rowStyle = isSelected
    ? s.voiceRowSelected
    : isHovered
      ? s.voiceRowHover
      : s.voiceRowBase;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={voice.label}
      style={rowStyle}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={s.voiceRowInfo}>
        <p style={s.voiceRowName}>{voice.label}</p>
        <p style={s.voiceRowCategory}>cloned</p>
      </div>
    </button>
  );
}

// ── LibraryVoiceRow ───────────────────────────────────────────────────────────

/** Props for a single ElevenLabs library voice row. */
export interface LibraryVoiceRowProps {
  voice: ElevenLabsVoice;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPlayToggle: () => void;
}

/**
 * A single row in the "ElevenLabs Library" section.
 *
 * Contains two controls: the voice select button and the play/stop preview button.
 * The outer div carries hover state; neither interactive control wraps the other.
 */
export function LibraryVoiceRow({
  voice,
  isSelected,
  isPlaying,
  onSelect,
  onPlayToggle,
}: LibraryVoiceRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const rowStyle = isSelected
    ? s.voiceRowSelected
    : isHovered
      ? s.voiceRowHover
      : s.voiceRowBase;

  const categoryLabel = buildCategoryLabel(voice);

  return (
    <div
      style={rowStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={voice.name}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: 0,
        }}
        onClick={onSelect}
      >
        <div style={s.voiceRowInfo}>
          <p style={s.voiceRowName}>{voice.name}</p>
          {categoryLabel && <p style={s.voiceRowCategory}>{categoryLabel}</p>}
        </div>
      </button>
      <button
        type="button"
        aria-label={
          isPlaying ? `Stop preview for ${voice.name}` : `Play preview for ${voice.name}`
        }
        style={s.playButton}
        onClick={(e) => {
          e.stopPropagation();
          onPlayToggle();
        }}
      >
        {isPlaying ? '■' : '▶'}
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a human-readable category label from a voice's category and labels.
 * Returns null when there is nothing meaningful to display.
 */
export function buildCategoryLabel(voice: ElevenLabsVoice): string | null {
  const parts: string[] = [];
  if (voice.category && voice.category !== 'premade') {
    parts.push(voice.category);
  }
  const { gender, accent, age } = voice.labels;
  if (gender) parts.push(gender);
  if (accent) parts.push(accent);
  if (age) parts.push(age);
  return parts.length > 0 ? parts.join(' · ') : voice.category || null;
}
