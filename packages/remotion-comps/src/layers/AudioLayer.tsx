import React from 'react';
import { Audio } from 'remotion';

interface AudioLayerProps {
  src: string;
  volume?: number;
  startFrom?: number;
  endAt?: number;
}

export function AudioLayer({ src, volume, startFrom, endAt }: AudioLayerProps): React.ReactElement {
  return <Audio src={src} volume={volume} startFrom={startFrom} endAt={endAt} />;
}
