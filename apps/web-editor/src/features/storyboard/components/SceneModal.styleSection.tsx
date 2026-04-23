/**
 * SceneModal.styleSection — Visual Style selector section for SceneModal.
 *
 * Renders STORYBOARD_STYLES as single-select radio cards.
 * Extracted from SceneModal.tsx to keep that file under the 300-line cap.
 */

import React from 'react';

import { STORYBOARD_STYLES } from '@ai-video-editor/api-contracts';

import {
  animationStubStyle,
  sectionLabelStyle,
  styleCardDescStyle,
  styleCardLabelStyle,
  styleCardSelectedStyle,
  styleCardStyle,
  styleGridStyle,
  styleSwatchStyle,
} from './SceneModal.styles';

// ── Props ──────────────────────────────────────────────────────────────────────

interface SceneModalStyleSectionProps {
  selectedStyle: string | null;
  onSelect: (styleId: string | null) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Style + Animation sections rendered inside SceneModal.
 */
export function SceneModalStyleSection({
  selectedStyle,
  onSelect,
}: SceneModalStyleSectionProps): React.ReactElement {
  return (
    <>
      {/* Style selector */}
      <section aria-label="Visual style">
        <p style={sectionLabelStyle}>Visual Style</p>
        <div style={styleGridStyle} data-testid="style-grid" role="radiogroup" aria-label="Visual style">
          {STORYBOARD_STYLES.map((preset) => {
            const isSelected = selectedStyle === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                style={isSelected ? styleCardSelectedStyle : styleCardStyle}
                onClick={() => onSelect(isSelected ? null : preset.id)}
                role="radio"
                aria-checked={isSelected}
                aria-label={preset.label}
                data-testid={`style-card-${preset.id}`}
              >
                <div style={{ ...styleSwatchStyle, background: preset.previewColor }} />
                <span style={styleCardLabelStyle}>{preset.label}</span>
                <span style={styleCardDescStyle}>{preset.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Animation stub */}
      <section aria-label="Animation">
        <p style={sectionLabelStyle}>Animation</p>
        <div style={animationStubStyle} aria-disabled="true" data-testid="animation-stub">
          Coming soon
        </div>
      </section>
    </>
  );
}
