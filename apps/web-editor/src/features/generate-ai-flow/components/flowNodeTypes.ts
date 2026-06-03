import type { NodeTypes } from '@xyflow/react';

import { ContentNode } from './ContentNode';
import { GenerationNode } from './GenerationNode';
import { ResultNode } from './ResultNode';

/** Maps FlowBlock.type discriminants → custom node components. */
export const FLOW_NODE_TYPES: NodeTypes = {
  content: ContentNode,
  generation: GenerationNode,
  result: ResultNode,
};
