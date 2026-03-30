import { getRemotionEnvironment } from 'remotion';

/**
 * Detects whether the composition is running inside the Remotion SSR render pipeline
 * or in a browser Player. Used by VideoLayer to switch between <OffthreadVideo> and <Video>.
 */
export function useRemotionEnvironment(): { isRendering: boolean } {
  const { isRendering } = getRemotionEnvironment();
  return { isRendering };
}
