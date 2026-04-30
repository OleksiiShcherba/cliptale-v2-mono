import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SURFACE } from '../components/storyboardPageStyles';

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
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,abc123');

    const result = await captureCanvasThumbnail();

    expect(result).toBe('data:image/jpeg;base64,abc123');
    expect(mockToJpeg).toHaveBeenCalledWith(
      fakeEl,
      expect.objectContaining({
        width: 1200,
        height: 800,
        canvasWidth: 320,
        canvasHeight: 180,
        quality: 0.6,
        skipFonts: true,
        pixelRatio: 1,
        backgroundColor: SURFACE,
      }),
    );
  });

  it('passes getBoundingClientRect dimensions as width/height to toJpeg', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 1440,
      height: 900,
      top: 0,
      left: 0,
      bottom: 900,
      right: 1440,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,xyz');

    await captureCanvasThumbnail();

    expect(mockToJpeg).toHaveBeenCalledOnce();
    const options = mockToJpeg.mock.calls[0][1];
    // Source dimensions come from getBoundingClientRect
    expect(options.width).toBe(1440);
    expect(options.height).toBe(900);
    // Output dimensions are fixed 320×180
    expect(options.canvasWidth).toBe(320);
    expect(options.canvasHeight).toBe(180);
  });

  it('passes backgroundColor as SURFACE color to prevent black JPEG', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,bg-test');

    await captureCanvasThumbnail();

    expect(mockToJpeg).toHaveBeenCalledOnce();
    const options = mockToJpeg.mock.calls[0][1];
    // backgroundColor must be set to prevent transparent→black JPEG encoding
    expect(options.backgroundColor).toBe(SURFACE);
  });

  it('falls back to clientWidth/clientHeight when getBoundingClientRect returns zero', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    // Simulate non-zero clientWidth/clientHeight (jsdom assigns 0 by default but
    // the element may have a layout dimension in real browsers)
    Object.defineProperty(fakeEl, 'clientWidth', { value: 960, configurable: true });
    Object.defineProperty(fakeEl, 'clientHeight', { value: 600, configurable: true });
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,fallback-test');

    await captureCanvasThumbnail();

    expect(mockToJpeg).toHaveBeenCalledOnce();
    const options = mockToJpeg.mock.calls[0][1];
    expect(options.width).toBe(960);
    expect(options.height).toBe(600);
  });

  it('uses 1200×800 defaults when both getBoundingClientRect and clientWidth/Height are zero', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    // clientWidth and clientHeight both 0 (jsdom default)
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,defaults-test');

    await captureCanvasThumbnail();

    expect(mockToJpeg).toHaveBeenCalledOnce();
    const options = mockToJpeg.mock.calls[0][1];
    expect(options.width).toBe(1200);
    expect(options.height).toBe(800);
  });

  it('passes imagePlaceholder as a data URL string', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    mockToJpeg.mockResolvedValue('data:image/jpeg;base64,placeholder-test');

    await captureCanvasThumbnail();

    expect(mockToJpeg).toHaveBeenCalledOnce();
    const options = mockToJpeg.mock.calls[0][1];
    const placeholder = options.imagePlaceholder as string;
    expect(typeof placeholder).toBe('string');
    expect(placeholder.startsWith('data:')).toBe(true);
    expect(placeholder.length).toBeGreaterThan(0);
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
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    mockToJpeg.mockRejectedValue(new Error('canvas rendering failed'));

    const result = await captureCanvasThumbnail();

    expect(result).toBeNull();
  });

  it('does not throw when toJpeg rejects', async () => {
    const fakeEl = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(fakeEl);
    vi.spyOn(fakeEl, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    mockToJpeg.mockRejectedValue(new Error('unexpected DOM error'));

    await expect(captureCanvasThumbnail()).resolves.toBeNull();
  });
});
