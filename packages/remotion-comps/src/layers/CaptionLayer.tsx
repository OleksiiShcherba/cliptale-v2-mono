import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

type CaptionWord = {
  word: string;
  startFrame: number;
  endFrame: number;
};

interface CaptionLayerProps {
  words: CaptionWord[];
  /**
   * The enclosing `<Sequence from=…>` start frame. When the layer is wrapped
   * in a Sequence (which it always is inside `VideoComposition`), Remotion's
   * `useCurrentFrame()` returns a frame that is **local** to the Sequence
   * (0-based from `from`), while `word.startFrame` is an **absolute** frame
   * in the composition timeline (as emitted by `useAddCaptionsToTimeline`
   * from Whisper timestamps). Pass the clip's `startFrame` here so the layer
   * can reconstruct the absolute frame and compare correctly. Defaults to 0
   * for the standalone / fixture case where the layer is mounted outside a
   * Sequence.
   */
  clipStartFrame?: number;
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
 * `inactiveColor` to `activeColor` when the absolute composition frame has
 * reached `word.startFrame`, and remain `activeColor` for the rest of the
 * segment duration.
 *
 * Frame semantic: `word.startFrame` / `word.endFrame` are **absolute** frames
 * in the composition timeline. Because this layer is mounted inside a
 * `<Sequence from={clip.startFrame}>`, `useCurrentFrame()` returns a frame
 * that is *local* to that Sequence (0-based). The `clipStartFrame` prop lets
 * the layer reconstruct the absolute frame as `clipStartFrame +
 * useCurrentFrame()`. Without this offset, every caption clip after the
 * first one (i.e. any clip with `startFrame > 0`) never reached its words'
 * absolute `startFrame` and the words stayed at `inactiveColor`.
 *
 * Frame-based comparisons are used exclusively — no JS timers, no CSS
 * animations — making this layer deterministic for SSR rendering.
 */
export function CaptionLayer({
  words,
  clipStartFrame = 0,
  activeColor = '#FFFFFF',
  inactiveColor = 'rgba(255,255,255,0.35)',
  fontSize = 24,
  position = 'bottom',
}: CaptionLayerProps): React.ReactElement {
  const currentFrame = clipStartFrame + useCurrentFrame();

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
