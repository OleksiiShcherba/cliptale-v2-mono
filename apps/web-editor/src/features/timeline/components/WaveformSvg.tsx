import React from 'react';

interface WaveformSvgProps {
  peaks: number[];
  width: number;
  height: number;
}

/**
 * Renders a simplified bar-chart waveform from peak amplitude values.
 * Each peak value is expected in range [0, 1].
 */
export function WaveformSvg({ peaks, width, height }: WaveformSvgProps): React.ReactElement {
  const barWidth = Math.max(1, width / peaks.length);
  const mid = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={style}
    >
      {peaks.map((peak, i) => {
        const barHeight = Math.max(1, peak * mid);
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={mid - barHeight}
            width={barWidth - 0.5}
            height={barHeight * 2}
            fill="rgba(255,255,255,0.4)"
          />
        );
      })}
    </svg>
  );
}

const style: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  pointerEvents: 'none',
};
