/**
 * Tests for StoryboardCanvas — SB-POLISH-1e: knife tool integration.
 *
 * Verifies that StoryboardCanvas correctly:
 *   1. Applies a crosshair cursor when `cursorMode === 'knife'`.
 *   2. Disables pan-on-drag and node dragging in knife mode.
 *   3. Suppresses `onNodeClick` and wires `onEdgeClick` to `onCutEdge` in knife mode.
 *   4. Reverts to grab cursor and normal behavior when `cursorMode === 'grab'`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect } from '@xyflow/react';

import { StoryboardCanvas } from './StoryboardCanvas';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { capturedReactFlowProps } = vi.hoisted(() => ({
  capturedReactFlowProps: {
    current: {} as Record<string, any>,
  },
}));

// ── Mocked dependencies ────────────────────────────────────────────────────────

// Mock React Flow components so we can inspect props passed to ReactFlow.
const mockZoomTo = vi.fn();
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: any) => {
    capturedReactFlowProps.current = props;
    return (
      <div
        data-testid="react-flow-mock"
        data-style={JSON.stringify(props.style)}
        data-pan-on-drag={String(props.panOnDrag)}
        data-nodes-draggable={String(props.nodesDraggable)}
        data-has-edge-click={props.onEdgeClick ? 'true' : 'false'}
        data-has-node-click={props.onNodeClick ? 'true' : 'false'}
      >
        {props.children}
      </div>
    );
  },
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useReactFlow: () => ({ zoomTo: mockZoomTo }),
}));

vi.mock('./CanvasToolbar', () => ({
  CanvasToolbar: () => <div data-testid="canvas-toolbar" />,
}));

vi.mock('./ZoomToolbar', () => ({
  ZoomToolbar: () => <div data-testid="zoom-toolbar" />,
}));

vi.mock('./GhostDragPortal', () => ({
  GhostDragPortal: () => <div data-testid="ghost-drag-portal" />,
}));

// ── Test utilities ────────────────────────────────────────────────────────────

const makeNode = (id: string, type: string = 'scene-block'): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { name: `Node ${id}` },
});

const makeEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StoryboardCanvas — knife tool integration (SB-POLISH-1e)', () => {
  let mockOnNodesChange: ReturnType<typeof vi.fn>;
  let mockOnEdgesChange: ReturnType<typeof vi.fn>;
  let mockOnConnect: ReturnType<typeof vi.fn>;
  let mockOnNodeClick: ReturnType<typeof vi.fn>;
  let mockOnCutEdge: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnNodesChange = vi.fn();
    mockOnEdgesChange = vi.fn();
    mockOnConnect = vi.fn();
    mockOnNodeClick = vi.fn();
    mockOnCutEdge = vi.fn();
  });

  const defaultProps = {
    nodes: [makeNode('start', 'start'), makeNode('scene1', 'scene-block'), makeNode('end', 'end')],
    edges: [makeEdge('edge1', 'start', 'scene1'), makeEdge('edge2', 'scene1', 'end')],
    nodeTypes: { 'scene-block': () => null, start: () => null, end: () => null },
    onNodesChange: mockOnNodesChange,
    onEdgesChange: mockOnEdgesChange,
    onConnect: mockOnConnect,
    isValidConnection: () => true,
    onNodeDragStart: vi.fn(),
    onNodeDrag: vi.fn(),
    onNodeDragStop: vi.fn(),
    dragState: null,
    onAddBlock: vi.fn(),
  };

  it('grab mode (default): cursor is not crosshair, pan-on-drag is true, nodes draggable', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        cursorMode="grab"
        onNodeClick={mockOnNodeClick}
        onCutEdge={mockOnCutEdge}
      />,
    );

    // In grab mode, the style should NOT include cursor: 'crosshair'.
    expect(capturedReactFlowProps.current.style?.cursor).not.toBe('crosshair');

    // Pan-on-drag and node dragging should be enabled.
    expect(capturedReactFlowProps.current.panOnDrag).toBe(true);
    expect(capturedReactFlowProps.current.nodesDraggable).toBe(true);

    // onNodeClick should be passed through.
    expect(capturedReactFlowProps.current.onNodeClick).toBeDefined();

    // onEdgeClick should NOT be wired (no onCutEdge in grab mode).
    expect(capturedReactFlowProps.current.onEdgeClick).toBeUndefined();
  });

  it('knife mode: cursor is crosshair, pan-on-drag is false, nodes not draggable', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        cursorMode="knife"
        onNodeClick={mockOnNodeClick}
        onCutEdge={mockOnCutEdge}
      />,
    );

    // In knife mode, style should include cursor: 'crosshair'.
    expect(capturedReactFlowProps.current.style?.cursor).toBe('crosshair');

    // Pan-on-drag and node dragging should be disabled.
    expect(capturedReactFlowProps.current.panOnDrag).toBe(false);
    expect(capturedReactFlowProps.current.nodesDraggable).toBe(false);
  });

  it('knife mode: onNodeClick is suppressed (set to undefined)', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        cursorMode="knife"
        onNodeClick={mockOnNodeClick}
        onCutEdge={mockOnCutEdge}
      />,
    );

    // onNodeClick should be suppressed in knife mode (passed as undefined).
    expect(capturedReactFlowProps.current.onNodeClick).toBeUndefined();
  });

  it('knife mode: onEdgeClick is wired to onCutEdge', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        cursorMode="knife"
        onCutEdge={mockOnCutEdge}
      />,
    );

    // onEdgeClick should be wired in knife mode.
    expect(capturedReactFlowProps.current.onEdgeClick).toBeDefined();
  });

  it('grab mode: onEdgeClick is NOT wired (no onCutEdge handler)', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        cursorMode="grab"
        onCutEdge={mockOnCutEdge}
      />,
    );

    // onEdgeClick should NOT be wired in grab mode.
    expect(capturedReactFlowProps.current.onEdgeClick).toBeUndefined();
  });

  it('knife mode without onCutEdge prop: onEdgeClick remains unset', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        cursorMode="knife"
        // Omit onCutEdge prop
      />,
    );

    // Even in knife mode, if onCutEdge is not provided, onEdgeClick is not wired.
    expect(capturedReactFlowProps.current.onEdgeClick).toBeUndefined();
  });

  it('default cursorMode (undefined) behaves like grab mode', () => {
    render(
      <StoryboardCanvas
        {...defaultProps}
        // Omit cursorMode (defaults to 'grab')
        onNodeClick={mockOnNodeClick}
      />,
    );

    // Default behavior should match grab mode.
    expect(capturedReactFlowProps.current.style?.cursor).not.toBe('crosshair');

    expect(capturedReactFlowProps.current.panOnDrag).toBe(true);
    expect(capturedReactFlowProps.current.nodesDraggable).toBe(true);
    expect(capturedReactFlowProps.current.onNodeClick).toBeDefined();
    expect(capturedReactFlowProps.current.onEdgeClick).toBeUndefined();
  });
});
