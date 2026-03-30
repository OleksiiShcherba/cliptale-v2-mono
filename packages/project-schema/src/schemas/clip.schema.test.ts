import { describe, it, expect } from 'vitest';

import { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema } from './clip.schema.js';

const baseVideoClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'video' as const,
  assetId: '00000000-0000-0000-0000-000000000002',
  trackId: '00000000-0000-0000-0000-000000000003',
  startFrame: 0,
  durationFrames: 90,
};

const baseAudioClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'audio' as const,
  assetId: '00000000-0000-0000-0000-000000000002',
  trackId: '00000000-0000-0000-0000-000000000003',
  startFrame: 0,
  durationFrames: 90,
};

const baseTextClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'text-overlay' as const,
  trackId: '00000000-0000-0000-0000-000000000003',
  startFrame: 0,
  durationFrames: 90,
  text: 'Hello world',
};

describe('videoClipSchema', () => {
  it('should parse a valid video clip', () => {
    expect(videoClipSchema.safeParse(baseVideoClip).success).toBe(true);
  });

  it('should default trimInFrame to 0', () => {
    const result = videoClipSchema.safeParse(baseVideoClip);
    expect(result.success && result.data.trimInFrame).toBe(0);
  });

  it('should default opacity to 1', () => {
    const result = videoClipSchema.safeParse(baseVideoClip);
    expect(result.success && result.data.opacity).toBe(1);
  });

  it('should default volume to 1', () => {
    const result = videoClipSchema.safeParse(baseVideoClip);
    expect(result.success && result.data.volume).toBe(1);
  });

  it('should accept an explicit trimOutFrame', () => {
    const result = videoClipSchema.safeParse({ ...baseVideoClip, trimOutFrame: 60 });
    expect(result.success && result.data.trimOutFrame).toBe(60);
  });

  it('should accept trimOutFrame as undefined when omitted', () => {
    const result = videoClipSchema.safeParse(baseVideoClip);
    expect(result.success && result.data.trimOutFrame).toBeUndefined();
  });

  it('should reject opacity outside 0–1 range', () => {
    expect(videoClipSchema.safeParse({ ...baseVideoClip, opacity: 1.5 }).success).toBe(false);
    expect(videoClipSchema.safeParse({ ...baseVideoClip, opacity: -0.1 }).success).toBe(false);
  });

  it('should reject volume outside 0–1 range', () => {
    expect(videoClipSchema.safeParse({ ...baseVideoClip, volume: 2 }).success).toBe(false);
    expect(videoClipSchema.safeParse({ ...baseVideoClip, volume: -0.1 }).success).toBe(false);
  });

  it('should reject non-positive durationFrames', () => {
    expect(videoClipSchema.safeParse({ ...baseVideoClip, durationFrames: 0 }).success).toBe(false);
  });

  it('should reject negative startFrame', () => {
    expect(videoClipSchema.safeParse({ ...baseVideoClip, startFrame: -1 }).success).toBe(false);
  });
});

describe('audioClipSchema', () => {
  it('should parse a valid audio clip', () => {
    expect(audioClipSchema.safeParse(baseAudioClip).success).toBe(true);
  });

  it('should default volume to 1', () => {
    const result = audioClipSchema.safeParse(baseAudioClip);
    expect(result.success && result.data.volume).toBe(1);
  });

  it('should default trimInFrame to 0', () => {
    const result = audioClipSchema.safeParse(baseAudioClip);
    expect(result.success && result.data.trimInFrame).toBe(0);
  });

  it('should accept an explicit trimOutFrame', () => {
    const result = audioClipSchema.safeParse({ ...baseAudioClip, trimOutFrame: 45 });
    expect(result.success && result.data.trimOutFrame).toBe(45);
  });

  it('should reject volume outside 0–1 range', () => {
    expect(audioClipSchema.safeParse({ ...baseAudioClip, volume: 1.1 }).success).toBe(false);
    expect(audioClipSchema.safeParse({ ...baseAudioClip, volume: -1 }).success).toBe(false);
  });

  it('should reject non-positive durationFrames', () => {
    expect(audioClipSchema.safeParse({ ...baseAudioClip, durationFrames: 0 }).success).toBe(false);
  });
});

describe('textOverlayClipSchema', () => {
  it('should parse a valid text overlay clip', () => {
    expect(textOverlayClipSchema.safeParse(baseTextClip).success).toBe(true);
  });

  it('should default position to bottom', () => {
    const result = textOverlayClipSchema.safeParse(baseTextClip);
    expect(result.success && result.data.position).toBe('bottom');
  });

  it('should default fontSize to 24', () => {
    const result = textOverlayClipSchema.safeParse(baseTextClip);
    expect(result.success && result.data.fontSize).toBe(24);
  });

  it('should default color to #FFFFFF', () => {
    const result = textOverlayClipSchema.safeParse(baseTextClip);
    expect(result.success && result.data.color).toBe('#FFFFFF');
  });

  it('should accept all valid position values', () => {
    const positions = ['top', 'center', 'bottom'] as const;
    for (const position of positions) {
      expect(textOverlayClipSchema.safeParse({ ...baseTextClip, position }).success).toBe(true);
    }
  });

  it('should reject invalid position value', () => {
    expect(textOverlayClipSchema.safeParse({ ...baseTextClip, position: 'left' }).success).toBe(false);
  });

  it('should reject non-positive durationFrames', () => {
    expect(textOverlayClipSchema.safeParse({ ...baseTextClip, durationFrames: 0 }).success).toBe(false);
  });

  it('should reject non-positive fontSize', () => {
    expect(textOverlayClipSchema.safeParse({ ...baseTextClip, fontSize: 0 }).success).toBe(false);
    expect(textOverlayClipSchema.safeParse({ ...baseTextClip, fontSize: -5 }).success).toBe(false);
  });
});

describe('clipSchema (discriminated union)', () => {
  it('should route video type to videoClipSchema', () => {
    expect(clipSchema.safeParse(baseVideoClip).success).toBe(true);
  });

  it('should route audio type to audioClipSchema', () => {
    expect(clipSchema.safeParse(baseAudioClip).success).toBe(true);
  });

  it('should route text-overlay type to textOverlayClipSchema', () => {
    expect(clipSchema.safeParse(baseTextClip).success).toBe(true);
  });

  it('should reject an unknown clip type', () => {
    expect(clipSchema.safeParse({ ...baseVideoClip, type: 'image' }).success).toBe(false);
  });
});
