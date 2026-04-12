import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

type CaptionWord = {
  word: string;
  startFrame: number;
  endFrame: number;
};

interface CaptionLayerProps {
  words: CaptionWord[];
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  position?: 'top' | 'center' | 'bottom';
}

const POSITION_STYLES: Record<NonNullable<CaptionLayerProps['position']>, React.CSSProperties> = {
  top: { justifyContent: 'flex-start', paddingTop: 40 },
  center: { justifyContent: 'center' },
  bottom: { justifyContent: 'flex-end', paddingBottom: 40 },
};

/**
 * Remotion layer for progressive-reveal captions.
 *
 * All words of a segment are shown simultaneously. Words switch from
 * `inactiveColor` to `activeColor` when `currentFrame >= word.startFrame`
 * and remain `activeColor` for the rest of the segment duration.
 *
 * Frame-based comparisons are used exclusively — no JS timers, no CSS
 * animations — making this layer deterministic for SSR rendering.
 */
export function CaptionLayer({
  words,
  activeColor = '#FFFFFF',
  inactiveColor = 'rgba(255,255,255,0.35)',
  fontSize = 24,
  position = 'bottom',
}: CaptionLayerProps): React.ReactElement {
  const currentFrame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        ...POSITION_STYLES[position],
      }}
    >
      <span
        style={{
          fontSize,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          textAlign: 'center',
          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
          padding: '4px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {words.map((w, index) => {
          const isActive = currentFrame >= w.startFrame;
          return (
            <React.Fragment key={index}>
              <span style={{ color: isActive ? activeColor : inactiveColor, whiteSpace: 'pre' }}>
                {w.word}
              </span>
              {index < words.length - 1 && (
                <span style={{ color: inactiveColor, whiteSpace: 'pre' }}>{' '}</span>
              )}
            </React.Fragment>
          );
        })}
      </span>
    </AbsoluteFill>
  );
}
