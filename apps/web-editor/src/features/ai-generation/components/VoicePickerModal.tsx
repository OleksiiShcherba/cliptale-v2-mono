import { useState, useRef, useEffect, type MouseEvent } from 'react';

import { getVoiceSampleUrl } from '@/features/ai-generation/api';
import type { ElevenLabsVoice } from '@/features/ai-generation/types';
import { useAvailableVoices } from '@/features/ai-generation/hooks/useAvailableVoices';
import { useUserVoices } from '@/features/ai-generation/hooks/useUserVoices';

import { LibraryVoiceRow, UserVoiceRow } from './VoicePickerRows';
import * as s from './voicePickerStyles';

/** Props for the VoicePickerModal. */
export interface VoicePickerModalProps {
  /** The currently selected ElevenLabs voice_id, or undefined if none. */
  value: string | undefined;
  /** Called when the user confirms a voice selection. */
  onSelect: (voiceId: string) => void;
  /** Called when the user dismisses the modal without confirming. */
  onClose: () => void;
}

/**
 * Full-screen overlay modal for browsing and selecting an ElevenLabs voice.
 *
 * Two sections:
 *   - "Your Voices" — cloned voices fetched from GET /ai/voices
 *   - "ElevenLabs Library" — catalog voices from GET /ai/voices/available
 *
 * Each voice row has a Play/Stop button that fetches a presigned S3 URL via
 * GET /ai/voices/:voiceId/sample?previewUrl=... and plays the MP3 in-browser.
 * Only one voice plays at a time; starting a new preview stops the current one.
 *
 * A client-side search filter runs over both lists on every keystroke.
 */
export function VoicePickerModal({ value, onSelect, onClose }: VoicePickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingVoiceId, setPendingVoiceId] = useState<string | undefined>(value);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | undefined>(undefined);
  const [isConfirmHovered, setIsConfirmHovered] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { userVoices, isLoading: isLoadingUserVoices, isError: isErrorUserVoices } = useUserVoices();
  const { libraryVoices, isLoading: isLoadingLibrary, isError: isErrorLibrary } = useAvailableVoices();

  // Stop audio when the modal closes.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredUserVoices = normalizedQuery
    ? userVoices.filter((v) => v.label.toLowerCase().includes(normalizedQuery))
    : userVoices;

  const filteredLibraryVoices = normalizedQuery
    ? libraryVoices.filter(
        (v) =>
          v.name.toLowerCase().includes(normalizedQuery) ||
          v.category.toLowerCase().includes(normalizedQuery),
      )
    : libraryVoices;

  /**
   * Fetches the presigned sample URL and toggles playback.
   * Stops any currently playing preview before starting a new one.
   */
  const handlePlayToggle = async (voice: ElevenLabsVoice) => {
    if (playingVoiceId === voice.voiceId) {
      // Stop current playback.
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingVoiceId(undefined);
      return;
    }

    // Stop previous audio before starting new one.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setPlayingVoiceId(voice.voiceId);

    try {
      const url = await getVoiceSampleUrl(voice.voiceId, voice.previewUrl);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener('ended', () => {
        setPlayingVoiceId(undefined);
        audioRef.current = null;
      });
      await audio.play();
    } catch {
      setPlayingVoiceId(undefined);
      audioRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (pendingVoiceId !== undefined) {
      onSelect(pendingVoiceId);
    }
  };

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const confirmStyle =
    pendingVoiceId !== undefined
      ? isConfirmHovered
        ? s.confirmButtonHover
        : s.confirmButton
      : s.confirmButtonDisabled;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select a voice"
      style={s.modalOverlay}
      onClick={handleOverlayClick}
    >
      <div style={s.modalPanel}>
        {/* Header */}
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Select a voice</h2>
          <button
            type="button"
            style={s.modalCloseButton}
            aria-label="Close voice picker"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div style={s.modalSearchBar}>
          <input
            type="search"
            role="searchbox"
            aria-label="Search voices"
            placeholder="Search voices…"
            style={s.modalSearchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Voice lists */}
        <div style={s.modalBody}>
          {/* Your Voices section */}
          <section aria-label="Your Voices">
            <h3 style={s.modalSectionHeading}>Your Voices</h3>
            <div style={s.voiceList}>
              {isLoadingUserVoices && (
                <p style={s.stateMessage}>Loading your voices…</p>
              )}
              {isErrorUserVoices && (
                <p role="alert" style={s.errorMessage}>
                  Could not load your voices.
                </p>
              )}
              {!isLoadingUserVoices && !isErrorUserVoices && filteredUserVoices.length === 0 && (
                <p style={s.stateMessage}>
                  {normalizedQuery
                    ? 'No voices match your search.'
                    : 'No cloned voices yet. Use Voice Cloning to create one.'}
                </p>
              )}
              {filteredUserVoices.map((voice) => (
                <UserVoiceRow
                  key={voice.voiceId}
                  voice={voice}
                  isSelected={pendingVoiceId === voice.elevenLabsVoiceId}
                  onSelect={() => setPendingVoiceId(voice.elevenLabsVoiceId)}
                />
              ))}
            </div>
          </section>

          {/* ElevenLabs Library section */}
          <section aria-label="ElevenLabs Library">
            <h3 style={s.modalSectionHeading}>ElevenLabs Library</h3>
            <div style={s.voiceList}>
              {isLoadingLibrary && (
                <p style={s.stateMessage}>Loading voice library…</p>
              )}
              {isErrorLibrary && (
                <p role="alert" style={s.errorMessage}>
                  Could not load the voice library.
                </p>
              )}
              {!isLoadingLibrary && !isErrorLibrary && filteredLibraryVoices.length === 0 && (
                <p style={s.stateMessage}>
                  {normalizedQuery ? 'No voices match your search.' : 'No voices available.'}
                </p>
              )}
              {filteredLibraryVoices.map((voice) => (
                <LibraryVoiceRow
                  key={voice.voiceId}
                  voice={voice}
                  isSelected={pendingVoiceId === voice.voiceId}
                  isPlaying={playingVoiceId === voice.voiceId}
                  onSelect={() => setPendingVoiceId(voice.voiceId)}
                  onPlayToggle={() => handlePlayToggle(voice)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={s.modalFooter}>
          <button type="button" style={s.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={confirmStyle}
            disabled={pendingVoiceId === undefined}
            onClick={handleConfirm}
            onMouseEnter={() => setIsConfirmHovered(true)}
            onMouseLeave={() => setIsConfirmHovered(false)}
          >
            Use this voice
          </button>
        </div>
      </div>
    </div>
  );
}
