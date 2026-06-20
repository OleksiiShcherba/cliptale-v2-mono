import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — the real @remotion/player cannot render in jsdom, so we capture the
// props it is constructed with (mirroring PreviewPanel.test.tsx).
// ---------------------------------------------------------------------------

const { mockPlayerProps } = vi.hoisted(() => {
  const mockPlayerProps: Record<string, unknown>[] = [];
  return { mockPlayerProps };
});

vi.mock('@remotion/player', () => ({
  Player: React.forwardRef((props: Record<string, unknown>, _ref: React.Ref<unknown>) => {
    mockPlayerProps.push(props);
    return React.createElement('div', { 'data-testid': 'remotion-player' });
  }),
}));

import { MotionGraphicPlayer } from './MotionGraphicPlayer.js';
import type { MotionGraphicGeometry } from './MotionGraphicPlayer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TSX = `
import React from 'react';
import { interpolate, useCurrentFrame, AbsoluteFill } from 'remotion';

export default function MyGraphic() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  return <AbsoluteFill style={{ opacity }}>Hello</AbsoluteFill>;
}
`;

const GEOMETRY: MotionGraphicGeometry = {
  durationSeconds: 5,
  fps: 30,
  width: 1920,
  height: 1080,
};

describe('MotionGraphicPlayer', () => {
  beforeEach(() => {
    mockPlayerProps.length = 0;
  });

  it('mounts a transpiled fixture into <Player> without crashing (smoke)', () => {
    const { getByTestId } = render(<MotionGraphicPlayer code={VALID_TSX} geometry={GEOMETRY} />);
    expect(getByTestId('remotion-player')).toBeTruthy();
  });

  it('derives durationInFrames from durationSeconds * fps', () => {
    render(<MotionGraphicPlayer code={VALID_TSX} geometry={GEOMETRY} />);
    expect(mockPlayerProps[0]?.durationInFrames).toBe(150);
  });

  it('passes fps / width / height geometry through to the Player', () => {
    render(<MotionGraphicPlayer code={VALID_TSX} geometry={GEOMETRY} />);
    expect(mockPlayerProps[0]?.fps).toBe(30);
    expect(mockPlayerProps[0]?.compositionWidth).toBe(1920);
    expect(mockPlayerProps[0]?.compositionHeight).toBe(1080);
  });

  it('plays the graphic back in real time — autoPlay + loop + controls (AC-02 / US-03)', () => {
    // The authoring preview must let the Creator WATCH the graphic play in real
    // time (spec §4 US-03 / AC-02). A static frame-0 mount (no autoPlay) shows a
    // black box for any intro/slide/fade graphic — the preview must auto-play,
    // loop, and expose controls so the Creator can pause / scrub / replay.
    render(<MotionGraphicPlayer code={VALID_TSX} geometry={GEOMETRY} />);
    expect(mockPlayerProps[0]?.autoPlay).toBe(true);
    expect(mockPlayerProps[0]?.loop).toBe(true);
    expect(mockPlayerProps[0]?.controls).toBe(true);
  });

  it('renders a fails-to-run fallback (no Player) for a non-compiling component', () => {
    const broken = 'export default function Broken( { return <div/>; }';
    const { queryByTestId, getByTestId } = render(
      <MotionGraphicPlayer code={broken} geometry={GEOMETRY} />,
    );
    expect(queryByTestId('remotion-player')).toBeNull();
    expect(getByTestId('motion-graphic-fails-to-run')).toBeTruthy();
  });
});
