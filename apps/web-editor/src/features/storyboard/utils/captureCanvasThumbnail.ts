import { toJpeg } from 'html-to-image';
import { SURFACE } from '../components/storyboardPageStyles';

/**
 * Captures the React Flow canvas as a JPEG data URL.
 *
 * Finds the `.react-flow` DOM element, reads its full rendered size via
 * `getBoundingClientRect()`, and passes that as the `width`/`height` options
 * so the SVG viewBox covers the entire React Flow viewport (including all nodes
 * regardless of how far they are from the origin). The output JPEG is then
 * scaled down to 320×180 via `canvasWidth`/`canvasHeight`.
 *
 * `backgroundColor: '#0D0D14'` (SURFACE) prevents the blank canvas (RGBA=0)
 * from encoding as RGB(0,0,0) — the JPEG alpha-flatten that produced all-black
 * thumbnails before this fix.
 *
 * Returns `null` if the element is not found or if `toJpeg` throws — never
 * throws itself.
 */
export async function captureCanvasThumbnail(): Promise<string | null> {
  const el = document.querySelector('.react-flow');
  if (!el) {
    return null;
  }

  const rect = (el as HTMLElement).getBoundingClientRect();
  const srcW = rect.width || (el as HTMLElement).clientWidth || 1200;
  const srcH = rect.height || (el as HTMLElement).clientHeight || 800;

  try {
    return await toJpeg(el as HTMLElement, {
      width: srcW,
      height: srcH,
      canvasWidth: 320,
      canvasHeight: 180,
      quality: 0.6,
      backgroundColor: SURFACE,
      skipFonts: true,
      pixelRatio: 1,
      imagePlaceholder:
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    });
  } catch {
    return null;
  }
}
