import { describe, it, expect } from 'vitest';

import { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema, imageClipSchema, captionClipSchema } from './clip.schema.js';

const baseVideoClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'video' as const,
  fileId: '00000000-0000-0000-0000-000000000002',
  trackId: '00000000-0000-0000-0000-000000000003',
  startFrame: 0,
  durationFrames: 90,
};

const baseAudioClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'audio' as const,
  fileId: '00000000-0000-0000-0000-000000000002',
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

const baseImageClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'image' as const,
  fileId: '00000000-0000-0000-0000-000000000002',
  trackId: '00000000-0000-0000-0000-000000000003',
  startFrame: 0,
  durationFrames: 150,
};

describe('imageClipSchema', () => {
  it('should parse a valid image clip', () => {
    expect(imageClipSchema.safeParse(baseImageClip).success).toBe(true);
  });

  it('should default opacity to 1', () => {
    const result = imageClipSchema.safeParse(baseImageClip);
    expect(result.success && result.data.opacity).toBe(1);
  });

  it('should accept explicit opacity values between 0 and 1', () => {
    expect(imageClipSchema.safeParse({ ...baseImageClip, opacity: 0.5 }).success).toBe(true);
    expect(imageClipSchema.safeParse({ ...baseImageClip, opacity: 0 }).success).toBe(true);
  });

  it('should reject opacity outside 0–1 range', () => {
    expect(imageClipSchema.safeParse({ ...baseImageClip, opacity: 1.5 }).success).toBe(false);
    expect(imageClipSchema.safeParse({ ...baseImageClip, opacity: -0.1 }).success).toBe(false);
  });

  it('should reject non-positive durationFrames', () => {
    expect(imageClipSchema.safeParse({ ...baseImageClip, durationFrames: 0 }).success).toBe(false);
  });

  it('should reject negative startFrame', () => {
    expect(imageClipSchema.safeParse({ ...baseImageClip, startFrame: -1 }).success).toBe(false);
  });
});

const baseCaptionClip = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'caption' as const,
  trackId: '00000000-0000-0000-0000-000000000003',
  startFrame: 0,
  durationFrames: 90,
  words: [
    { word: 'Hello', startFrame: 0, endFrame: 30 },
    { word: 'world', startFrame: 30, endFrame: 90 },
  ],
};

describe('captionClipSchema', () => {
  it('should parse a valid caption clip with all required fields', () => {
    expect(captionClipSchema.safeParse(baseCaptionClip).success).toBe(true);
  });

  it('should default activeColor to #FFFFFF', () => {
    const result = captionClipSchema.safeParse(baseCaptionClip);
    expect(result.success && result.data.activeColor).toBe('#FFFFFF');
  });

  it('should default inactiveColor to rgba(255,255,255,0.35)', () => {
    const result = captionClipSchema.safeParse(baseCaptionClip);
    expect(result.success && result.data.inactiveColor).toBe('rgba(255,255,255,0.35)');
  });

  it('should default fontSize to 24', () => {
    const result = captionClipSchema.safeParse(baseCaptionClip);
    expect(result.success && result.data.fontSize).toBe(24);
  });

  it('should default position to bottom', () => {
    const result = captionClipSchema.safeParse(baseCaptionClip);
    expect(result.success && result.data.position).toBe('bottom');
  });

  it('should accept explicit activeColor and inactiveColor', () => {
    const result = captionClipSchema.safeParse({
      ...baseCaptionClip,
      activeColor: '#FF0000',
      inactiveColor: 'rgba(255,0,0,0.5)',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activeColor).toBe('#FF0000');
      expect(result.data.inactiveColor).toBe('rgba(255,0,0,0.5)');
    }
  });

  it('should accept all valid position values', () => {
    const positions = ['top', 'center', 'bottom'] as const;
    for (const position of positions) {
      expect(captionClipSchema.safeParse({ ...baseCaptionClip, position }).success).toBe(true);
    }
  });

  it('should reject an invalid position value', () => {
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, position: 'left' }).success).toBe(false);
  });

  it('should reject non-positive fontSize', () => {
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, fontSize: 0 }).success).toBe(false);
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, fontSize: -5 }).success).toBe(false);
  });

  it('should reject non-positive durationFrames', () => {
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, durationFrames: 0 }).success).toBe(false);
  });

  it('should reject negative startFrame', () => {
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, startFrame: -1 }).success).toBe(false);
  });

  it('should reject when words is missing', () => {
    const { words: _, ...withoutWords } = baseCaptionClip;
    expect(captionClipSchema.safeParse(withoutWords).success).toBe(false);
  });

  it('should reject a word with negative startFrame', () => {
    const badWords = [{ word: 'Hello', startFrame: -1, endFrame: 30 }];
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, words: badWords }).success).toBe(false);
  });

  it('should reject a word with negative endFrame', () => {
    const badWords = [{ word: 'Hello', startFrame: 0, endFrame: -1 }];
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, words: badWords }).success).toBe(false);
  });

  it('should accept an empty words array', () => {
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, words: [] }).success).toBe(true);
  });

  it('should reject type literal other than caption', () => {
    expect(captionClipSchema.safeParse({ ...baseCaptionClip, type: 'text-overlay' }).success).toBe(false);
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

  it('should route image type to imageClipSchema', () => {
    expect(clipSchema.safeParse(baseImageClip).success).toBe(true);
  });

  it('should route caption type to captionClipSchema', () => {
    expect(clipSchema.safeParse(baseCaptionClip).success).toBe(true);
  });

  it('should reject an unknown clip type', () => {
    expect(clipSchema.safeParse({ ...baseVideoClip, type: 'unknown' }).success).toBe(false);
  });
});
