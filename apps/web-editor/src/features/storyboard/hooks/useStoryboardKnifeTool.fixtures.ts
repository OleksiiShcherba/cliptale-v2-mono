/**
 * Shared test fixtures for useStoryboardKnifeTool tests.
 */

import type { Node, Edge } from '@xyflow/react';

export function makeNode(id: string): Node {
  return { id, type: 'scene-block', position: { x: 0, y: 0 }, data: {} };
}

export function makeEdge(id: string, source = 'a', target = 'b'): Edge {
  return { id, source, target };
}

export function fireKeyDown(key: string, ctrlKey = false, metaKey = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, metaKey, bubbles: true }));
}

export function fireKeyUp(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}
