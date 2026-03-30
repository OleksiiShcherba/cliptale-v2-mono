import React from 'react';
import { AbsoluteFill } from 'remotion';

interface TextOverlayLayerProps {
  text: string;
  fontSize?: number;
  color?: string;
  position?: 'top' | 'center' | 'bottom';
}

const POSITION_STYLES: Record<NonNullable<TextOverlayLayerProps['position']>, React.CSSProperties> = {
  top: { justifyContent: 'flex-start', paddingTop: 40 },
  center: { justifyContent: 'center' },
  bottom: { justifyContent: 'flex-end', paddingBottom: 40 },
};

export function TextOverlayLayer({
  text,
  fontSize = 24,
  color = '#FFFFFF',
  position = 'bottom',
}: TextOverlayLayerProps): React.ReactElement {
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
          color,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          textAlign: 'center',
          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
          padding: '4px 12px',
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  );
}
