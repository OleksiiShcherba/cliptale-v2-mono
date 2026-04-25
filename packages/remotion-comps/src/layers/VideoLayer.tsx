import React from 'react';
import { Video, OffthreadVideo } from 'remotion';

import { useRemotionEnvironment } from '../hooks/useRemotionEnvironment.js';

interface VideoLayerProps {
  src: string;
  volume?: number;
  startFrom?: number;
  endAt?: number;
}

/**
 * Dual-mode video layer: uses <OffthreadVideo> in SSR render context (render-worker)
 * and <Video> in browser Player context. Never hardcode one primitive in a shared composition.
 */
export function VideoLayer({ src, volume, startFrom, endAt }: VideoLayerProps): React.ReactElement {
  const { isRendering } = useRemotionEnvironment();

  if (isRendering) {
    return <OffthreadVideo src={src} volume={volume} startFrom={startFrom} endAt={endAt} />;
  }

  return <Video src={src} volume={volume} startFrom={startFrom} endAt={endAt} />;
}
