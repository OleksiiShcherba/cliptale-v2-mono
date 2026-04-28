import { toJpeg } from 'html-to-image';

/**
 * Captures the React Flow canvas as a JPEG data URL.
 *
 * Finds the `.react-flow` DOM element and renders it to a JPEG at 320×180
 * with quality 0.6. Returns `null` if the element is not found or if
 * `toJpeg` throws — never throws itself.
 */
export async function captureCanvasThumbnail(): Promise<string | null> {
  const el = document.querySelector('.react-flow');
  if (!el) {
    return null;
  }

  try {
    return await toJpeg(el as HTMLElement, {
      width: 320,
      height: 180,
      quality: 0.6,
      skipFonts: true,
      pixelRatio: 1,
    });
  } catch {
    return null;
  }
}
