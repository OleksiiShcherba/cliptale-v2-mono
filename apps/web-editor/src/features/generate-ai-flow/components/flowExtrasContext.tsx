/**
 * FlowExtrasContext — supplies the DYNAMIC per-block node data (job state, preview
 * URL, Generate/retry/select handlers) to the canvas node components WITHOUT putting
 * those volatile values into the xyflow `nodes` array.
 *
 * Why: FlowCanvas derives the `nodes` array from the canvas document only, so a node's
 * identity changes solely on a real canvas edit and xyflow measures each node once. If
 * the live job/preview were baked into `nodes`, every poll tick would recreate the
 * nodes and xyflow would leave them visibility:hidden (never measured). Instead the
 * node components subscribe to this context and re-render in place as the data changes.
 */

import React from 'react';

import type { AiGenerationJob } from '@/shared/ai-generation/types';
import type { ReferenceContext } from './ResultNode';

export type GenerationExtras = {
  onGenerate?: (blockId: string) => void;
  onSelectModel?: (blockId: string) => void;
};

export type ResultExtras = {
  job?: AiGenerationJob | null;
  previewUrl?: string | null;
  onRetry?: () => void;
  /** Present when the flow is a reference flow opened from the storyboard (AC-06/07). */
  referenceContext?: ReferenceContext;
};

/** Actions available on every node regardless of kind (e.g. delete). */
export type NodeActions = {
  /** Remove this block (and its connections) from the canvas. */
  onDelete?: () => void;
};

export type FlowExtras = {
  generation: (blockId: string) => GenerationExtras;
  result: (blockId: string) => ResultExtras;
  nodeActions: (blockId: string) => NodeActions;
};

const EMPTY: FlowExtras = {
  generation: () => ({}),
  result: () => ({}),
  nodeActions: () => ({}),
};

const FlowExtrasContext = React.createContext<FlowExtras>(EMPTY);

export function FlowExtrasProvider({
  value,
  children,
}: {
  value: FlowExtras;
  children: React.ReactNode;
}): React.ReactElement {
  return <FlowExtrasContext.Provider value={value}>{children}</FlowExtrasContext.Provider>;
}

export function useGenerationExtras(blockId: string): GenerationExtras {
  return React.useContext(FlowExtrasContext).generation(blockId);
}

export function useResultExtras(blockId: string): ResultExtras {
  return React.useContext(FlowExtrasContext).result(blockId);
}

export function useNodeActions(blockId: string): NodeActions {
  return React.useContext(FlowExtrasContext).nodeActions(blockId);
}
