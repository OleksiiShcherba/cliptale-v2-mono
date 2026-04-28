import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToJpeg } = vi.hoisted(() => ({
  mockToJpeg: vi.fn<[HTMLElement, Record<string, unknown>], Promise<string>>(),
}));

vi.mock('html-to-image', () => ({
  toJpeg: mockToJpeg,
}));

import { captureCanvasThumbnail } from './captureCanvasThumbnail';

describe('captureCanvasThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns a JPEG data URL when .react-flow element is found', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,abc123');

    const result = await captureCanvasThumbnail();

    expect(result).toBe('data:image/jpeg;base64,abc123');
    expect(mockToJpeg).toHaveBeenCalledWith(fakeEl, {
      width: 320,
      height: 180,
      quality: 0.6,
      skipFonts: true,
      pixelRatio: 1,
    });
  });

  it('passes correct options to toJpeg', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,xyz');

    await captureCanvasThumbnail();

    expect(mockToJpeg).toHaveBeenCalledOnce();
    const options = mockToJpeg.mock.calls[0][1];
    expect(options).toMatchObject({
      width: 320,
      height: 180,
      quality: 0.6,
      skipFonts: true,
      pixelRatio: 1,
    });
  });

  it('returns null when .react-flow element is not found', async () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    const result = await captureCanvasThumbnail();

    expect(result).toBeNull();
    expect(mockToJpeg).not.toHaveBeenCalled();
  });

  it('returns null when toJpeg throws an error', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    mockToJpeg.mockRejectedValue(new Error('canvas rendering failed'));

    const result = await captureCanvasThumbnail();

    expect(result).toBeNull();
  });

  it('does not throw when toJpeg rejects', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    mockToJpeg.mockRejectedValue(new Error('unexpected DOM error'));

    await expect(captureCanvasThumbnail()).resolves.toBeNull();
  });
});
