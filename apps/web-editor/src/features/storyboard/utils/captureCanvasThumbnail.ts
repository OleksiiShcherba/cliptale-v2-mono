import { toJpeg } from 'html-to-image';
import { SURFACE } from '../components/storyboardPageStyles';

type CachedFetchPayload = {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: [string, string][];
};

const thumbnailResourceCache = new Map<string, Promise<CachedFetchPayload>>();

function getThumbnailResourceCacheKey(input: RequestInfo | URL): string | null {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;

  try {
    const parsed = new URL(url, window.location.href);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.replace(/[?#].*$/, '');
  }
}

function makeCachedResponse(payload: CachedFetchPayload): Response {
  return new Response(payload.body.slice(0), {
    status: payload.status,
    statusText: payload.statusText,
    headers: payload.headers,
  });
}

function createThumbnailCaptureFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const cacheKey = method.toUpperCase() === 'GET'
      ? getThumbnailResourceCacheKey(input)
      : null;

    if (!cacheKey) {
      return baseFetch(input, init);
    }

    let cachedPayload = thumbnailResourceCache.get(cacheKey);
    if (!cachedPayload) {
      cachedPayload = baseFetch(input, init).then(async (response) => ({
        body: await response.clone().arrayBuffer(),
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      }));
      thumbnailResourceCache.set(cacheKey, cachedPayload);
    }

    try {
      return makeCachedResponse(await cachedPayload);
    } catch (error) {
      thumbnailResourceCache.delete(cacheKey);
      throw error;
    }
  };
}

async function withThumbnailResourceCache<T>(fn: () => Promise<T>): Promise<T> {
  const originalFetch = window.fetch.bind(window);
  window.fetch = createThumbnailCaptureFetch(originalFetch);
  try {
    return await fn();
  } finally {
    window.fetch = originalFetch;
  }
}

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
    return await withThumbnailResourceCache(() =>
      toJpeg(el as HTMLElement, {
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
      }),
    );
  } catch {
    return null;
  }
}

// ── Typed capture with timeout (storyboard-autosave-checkpoints, AC-04) ───────

/** Hard ceiling for one capture attempt — checkpoints must never hang the save. */
export const CAPTURE_TIMEOUT_MS = 5_000;

/**
 * Result of a checkpoint capture attempt:
 * - `screenshot` — the real layout capture succeeded; `dataUrl` carries the
 *   320×180 JPEG to inline into the snapshot (ADR-0005);
 * - `minimap` — capture failed or exceeded {@link CAPTURE_TIMEOUT_MS}; the
 *   History entry falls back to the SVG minimap preview (AC-04) — a checkpoint
 *   is never silently dropped.
 */
export type CanvasCaptureResult =
  | { kind: 'screenshot'; dataUrl: string }
  | { kind: 'minimap' };

/**
 * Captures the canvas like {@link captureCanvasThumbnail} but always resolves
 * by {@link CAPTURE_TIMEOUT_MS} with a typed result instead of `null`.
 * Never rejects. A capture that loses the timeout race keeps running in the
 * background but its result is discarded.
 */
export async function captureCanvasThumbnailWithFallback(): Promise<CanvasCaptureResult> {
  const MINIMAP: CanvasCaptureResult = { kind: 'minimap' };

  const timeout = new Promise<CanvasCaptureResult>((resolve) => {
    setTimeout(() => resolve(MINIMAP), CAPTURE_TIMEOUT_MS);
  });

  const capture = captureCanvasThumbnail().then<CanvasCaptureResult>((dataUrl) =>
    dataUrl ? { kind: 'screenshot', dataUrl } : MINIMAP,
  );

  return Promise.race([capture, timeout]);
}
