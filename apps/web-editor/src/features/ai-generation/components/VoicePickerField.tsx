import { useState, type MouseEvent } from 'react';

import { useAvailableVoices } from '@/features/ai-generation/hooks/useAvailableVoices';
import { useUserVoices } from '@/features/ai-generation/hooks/useUserVoices';

import { VoicePickerModal } from './VoicePickerModal';
import * as s from './voiceFieldStyles';

/** Props for the VoicePickerField inline trigger. */
export interface VoicePickerFieldProps {
  /** The currently selected ElevenLabs voice_id, or undefined if none. */
  value: string | undefined;
  /** Called when the user selects or clears a voice. */
  onChange: (voiceId: string | undefined) => void;
  /** Label shown above the trigger button. */
  label: string;
  /** When true, shows a red asterisk next to the label. */
  required?: boolean;
  /** Optional help text shown below the trigger. */
  description?: string;
}

/**
 * Inline trigger that replaces the raw voice_id text input.
 *
 * - Shows "Select a voice…" when no voice is selected.
 * - Shows the selected voice name + a "×" clear button when a voice is selected.
 * - Opens a `VoicePickerModal` when the trigger is clicked.
 *
 * Resolves the selected voice name by looking it up in cached React Query data
 * (user voices + library voices) so it never issues extra fetches.
 */
export function VoicePickerField({
  value,
  onChange,
  label,
  required,
  description,
}: VoicePickerFieldProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load both voice lists to resolve a display name for the selected ID.
  // React Query deduplicates these — no extra fetches if the modal was open.
  const { userVoices } = useUserVoices();
  const { libraryVoices } = useAvailableVoices();

  const selectedName = resolveVoiceName(value, userVoices, libraryVoices);

  const handleSelect = (voiceId: string) => {
    onChange(voiceId);
    setIsModalOpen(false);
  };

  const handleClear = (e: MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  return (
    <div style={s.voiceFieldWrapper}>
      <p style={s.voiceFieldLabel}>
        {label}
        {required && (
          <span aria-hidden style={s.voiceFieldRequiredMarker}>
            *
          </span>
        )}
      </p>

      {value !== undefined && selectedName !== undefined ? (
        <div style={s.voiceFieldSelected}>
          <span>{selectedName}</span>
          <button
            type="button"
            style={s.voiceFieldClear}
            aria-label={`Clear ${label}`}
            onClick={handleClear}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          style={s.voiceFieldEmpty}
          onClick={() => setIsModalOpen(true)}
        >
          Select a voice…
        </button>
      )}

      {description && <p style={s.voiceFieldHelp}>{description}</p>}

      {isModalOpen && (
        <VoicePickerModal
          value={value}
          onSelect={handleSelect}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Looks up a human-readable name for the given voice_id in cached voice lists.
 * Returns `undefined` when the ID is not found in either list (e.g. stale data).
 */
function resolveVoiceName(
  voiceId: string | undefined,
  userVoices: { elevenLabsVoiceId: string; label: string }[],
  libraryVoices: { voiceId: string; name: string }[],
): string | undefined {
  if (voiceId === undefined) return undefined;

  const userMatch = userVoices.find((v) => v.elevenLabsVoiceId === voiceId);
  if (userMatch) return userMatch.label;

  const libraryMatch = libraryVoices.find((v) => v.voiceId === voiceId);
  if (libraryMatch) return libraryMatch.name;

  return undefined;
}
