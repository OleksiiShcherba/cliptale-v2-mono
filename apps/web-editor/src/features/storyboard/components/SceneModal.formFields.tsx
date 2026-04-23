/**
 * SceneModal.formFields — Name, Prompt, and Duration fields for SceneModal.
 *
 * Extracted from SceneModal.tsx to keep that file under the 300-line cap.
 */

import React from 'react';

import {
  inputStyle,
  numberInputStyle,
  sectionLabelStyle,
  textareaStyle,
} from './SceneModal.styles';

// ── Inline error style ─────────────────────────────────────────────────────────

const fieldErrorStyle: React.CSSProperties = {
  color: '#EF4444',
  fontSize: '12px',
  marginTop: '4px',
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface SceneModalFormFieldsProps {
  name: string;
  prompt: string;
  duration: number;
  promptError: string;
  durationError: string;
  onNameChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onDurationChange: (value: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Name, Prompt, and Duration form fields for SceneModal.
 */
export function SceneModalFormFields({
  name,
  prompt,
  duration,
  promptError,
  durationError,
  onNameChange,
  onPromptChange,
  onDurationChange,
}: SceneModalFormFieldsProps): React.ReactElement {
  return (
    <>
      {/* Name */}
      <section aria-label="Scene name">
        <p style={sectionLabelStyle}>Name</p>
        <input
          type="text"
          style={inputStyle}
          value={name}
          placeholder="SCENE 01"
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="Scene name"
          data-testid="name-input"
        />
      </section>

      {/* Prompt */}
      <section aria-label="Scene prompt">
        <p style={sectionLabelStyle}>Prompt *</p>
        <textarea
          style={textareaStyle}
          value={prompt}
          placeholder="Describe the scene content for AI generation…"
          onChange={(e) => onPromptChange(e.target.value)}
          aria-label="Scene prompt"
          data-testid="prompt-input"
          aria-describedby={promptError ? 'prompt-error' : undefined}
        />
        {promptError && (
          <p id="prompt-error" style={fieldErrorStyle} role="alert">
            {promptError}
          </p>
        )}
      </section>

      {/* Duration */}
      <section aria-label="Scene duration">
        <p style={sectionLabelStyle}>Duration (seconds) *</p>
        <input
          type="number"
          min={1}
          max={180}
          style={numberInputStyle}
          value={duration}
          onChange={(e) => onDurationChange(Number(e.target.value))}
          aria-label="Duration in seconds"
          data-testid="duration-input"
          aria-describedby={durationError ? 'duration-error' : undefined}
        />
        {durationError && (
          <p id="duration-error" style={fieldErrorStyle} role="alert">
            {durationError}
          </p>
        )}
      </section>
    </>
  );
}
