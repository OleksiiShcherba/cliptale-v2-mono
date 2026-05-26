import type { NodeTypes } from '@xyflow/react';

import { EndNode } from './EndNode';
import { MusicBlockNode } from './MusicBlockNode';
import { SceneBlockNode } from './SceneBlockNode';
import { StartNode } from './StartNode';

export const STORYBOARD_NODE_TYPES: NodeTypes = {
  start: StartNode,
  end: EndNode,
  'scene-block': SceneBlockNode,
  'music-block': MusicBlockNode,
};
