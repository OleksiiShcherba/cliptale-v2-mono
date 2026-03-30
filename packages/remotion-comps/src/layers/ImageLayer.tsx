import React from 'react';
import { Img } from 'remotion';

interface ImageLayerProps {
  src: string;
  style?: React.CSSProperties;
}

export function ImageLayer({ src, style }: ImageLayerProps): React.ReactElement {
  return <Img src={src} style={style} />;
}
