/**
 * EffectsPanel — sidebar panel shown when the "effects" tab is active.
 *
 * Layout:
 * - "Visual Styles" section: 3 style cards from STORYBOARD_STYLES catalog
 * - Clicking a style card reveals an inline apply-dialog with two buttons:
 *     "Apply to this scene" (disabled if no scene is selected, with tooltip)
 *     "Apply to all scenes" (always enabled)
 * - "Animation" section: placeholder with "Coming soon" badge (items disabled)
 *
 * No API calls in this component — store actions are synchronous.
 */

import React, { useState, useCallback } from 'react';

import { STORYBOARD_STYLES } from '@ai-video-editor/api-contracts';
import type { StoryboardStyle } from '@ai-video-editor/api-contracts';

import { applyStyleToBlock, applyStyleToAllBlocks } from '../store/storyboard-store';
import {
  animationItemLabelStyle,
  animationItemStyle,
  animationSectionHeaderStyle,
  animationSectionStyle,
  animationTitleStyle,
  applyAllButtonStyle,
  applyButtonDisabledStyle,
  applyButtonStyle,
  applyDialogStyle,
  cardsListStyle,
  comingSoonBadgeStyle,
  panelStyle,
  sectionHeaderStyle,
  styleCardDescriptionStyle,
  styleCardLabelStyle,
  styleCardStyle,
  styleCardTextStyle,
  swatchStyle,
  tooltipTextStyle,
} from './EffectsPanel.styles';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface EffectsPanelProps {
  /**
   * The currently selected scene-block node id.
   * Null when no scene is focused — disables "Apply to this scene".
   */
  selectedBlockId: string | null;
}

// ── Animation stub data ─────────────────────────────────────────────────────────

const ANIMATION_STUBS = [
  { id: 'fade-in', label: 'Fade In' },
  { id: 'slide-up', label: 'Slide Up' },
  { id: 'zoom-in', label: 'Zoom In' },
];

// ── EffectsPanel ───────────────────────────────────────────────────────────────

/**
 * Effects sidebar panel: Visual Styles + Animation stub.
 */
export function EffectsPanel({ selectedBlockId }: EffectsPanelProps): React.ReactElement {
  /** The style id whose apply-dialog is currently open. null → all closed. */
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);

  const handleCardClick = useCallback((styleId: string): void => {
    setActiveStyleId((prev) => (prev === styleId ? null : styleId));
  }, []);

  const handleApplyToScene = useCallback(
    (styleId: string): void => {
      if (!selectedBlockId) return;
      applyStyleToBlock(selectedBlockId, styleId);
      setActiveStyleId(null);
    },
    [selectedBlockId],
  );

  const handleApplyToAll = useCallback((styleId: string): void => {
    applyStyleToAllBlocks(styleId);
    setActiveStyleId(null);
  }, []);

  return (
    <div style={panelStyle} data-testid="effects-panel">
      {/* ── Visual Styles section ── */}
      <h3 style={sectionHeaderStyle} data-testid="visual-styles-heading">
        Visual Styles
      </h3>

      <div style={cardsListStyle} data-testid="style-cards-list">
        {STORYBOARD_STYLES.map((style: StoryboardStyle) => (
          <div key={style.id} data-testid={`style-card-${style.id}`}>
            {/* Style card row */}
            <button
              type="button"
              style={styleCardStyle}
              onClick={() => handleCardClick(style.id)}
              aria-expanded={activeStyleId === style.id}
              aria-label={`Apply ${style.label} visual style`}
            >
              {/* Color swatch */}
              <span
                style={{ ...swatchStyle, background: style.previewColor }}
                aria-hidden="true"
                data-testid={`style-swatch-${style.id}`}
              />
              {/* Text */}
              <span style={styleCardTextStyle}>
                <span style={styleCardLabelStyle}>{style.label}</span>
                <span style={styleCardDescriptionStyle}>{style.description}</span>
              </span>
            </button>

            {/* Apply dialog (inline, beneath the card) */}
            {activeStyleId === style.id && (
              <div style={applyDialogStyle} data-testid={`apply-dialog-${style.id}`}>
                {/* Apply to this scene — disabled if no block selected */}
                <button
                  type="button"
                  style={selectedBlockId ? applyButtonStyle : applyButtonDisabledStyle}
                  disabled={!selectedBlockId}
                  onClick={() => handleApplyToScene(style.id)}
                  title={selectedBlockId ? undefined : 'Select a scene first'}
                  aria-label="Apply to this scene"
                  data-testid="apply-to-scene-button"
                >
                  Apply to this scene
                </button>
                {!selectedBlockId && (
                  <span style={tooltipTextStyle} data-testid="apply-to-scene-hint">
                    Select a scene first
                  </span>
                )}
                {/* Apply to all scenes */}
                <button
                  type="button"
                  style={applyAllButtonStyle}
                  onClick={() => handleApplyToAll(style.id)}
                  aria-label="Apply to all scenes"
                  data-testid="apply-to-all-button"
                >
                  Apply to all scenes
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Animation section ── */}
      <div style={animationSectionStyle} data-testid="animation-section">
        <div style={animationSectionHeaderStyle}>
          <h3 style={animationTitleStyle}>Animation</h3>
          <span style={comingSoonBadgeStyle} data-testid="coming-soon-badge">
            Coming soon
          </span>
        </div>
        {ANIMATION_STUBS.map((anim) => (
          <div
            key={anim.id}
            style={animationItemStyle}
            aria-disabled="true"
            data-testid={`animation-item-${anim.id}`}
          >
            <span style={animationItemLabelStyle}>{anim.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
