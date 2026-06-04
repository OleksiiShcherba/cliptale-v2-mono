/**
 * useFlowCanvas — canvas state + typed-connection rules for the Generate AI flow (T17).
 *
 * The canvas is a node graph of three block kinds:
 *   - content    — a user-supplied text / image / audio / video input
 *   - generation — runs a catalog model; renders one input handle per required field,
 *                  typed by the catalog `modality` (AC-15)
 *   - result     — the output of a generation block; its output modality is the
 *                  generation model's group (image / video / audio)
 *
 * The interesting rules are extracted as PURE functions so they are unit-testable
 * without rendering xyflow:
 *   - requiredHandlesForModel — the typed input handles a generation node shows
 *   - blockOutputModality      — what modality a block's output port carries
 *   - validateConnection       — connect-time typed validation (AC-02 / AC-18)
 *   - reconcileModelChange     — rebuild handles + prune incompatible edges on a model
 *                                change, preserving result blocks (AC-07)
 *
 * The hook wires these into @xyflow/react state and serializes back to the
 * project-schema FlowCanvas shape using the server-authoritative params contract:
 *   - content block:    params.contentType: 'text' | 'asset', params.text | params.fileId
 *   - generation block: params.modelId; supplied params keyed by catalog field name
 *   - result block:     params.sourceBlockId
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type { Connection, Edge } from '@xyflow/react';
import { AI_MODELS } from '@ai-video-editor/api-contracts';
import type { AiModel } from '@ai-video-editor/api-contracts';
import type { FlowBlock, FlowCanvas, FlowEdge } from '@ai-video-editor/project-schema';

// ── Modality ──────────────────────────────────────────────────────────────────

/** Media kind a port carries. Mirrors api-contracts FieldModality + the result kinds. */
export type Modality = 'text' | 'image' | 'audio' | 'video';

/** The output port id every block exposes on its right side. */
export const OUTPUT_HANDLE = 'out';

/** A generation node's input handle, derived from a model field. */
export type TypedHandle = {
  /** Catalog field name — also the targetHandle id and the supplied-param key. */
  fieldName: string;
  /** Field label for display. */
  label: string;
  /** Media kind this handle accepts (drives connect-time validation). */
  modality: Modality;
  /** True for an image_url_list field — rendered as a multi ("three dots") input. */
  isList: boolean;
  /**
   * True when this field is one of an exactly-one-of (exclusiveGroup) set.
   * Such fields render a handle even though `required` is false at the field level.
   */
  exclusiveGroup?: string;
};

// ── Catalog helpers ─────────────────────────────────────────────────────────

/** Resolve a model from the static catalog by id. */
export function getModelById(modelId: string | undefined): AiModel | undefined {
  if (!modelId) return undefined;
  return AI_MODELS.find((m) => m.id === modelId);
}

/**
 * The output modality of a generation model, derived from its catalog `group`.
 *   images → image, videos → video, audio → audio
 */
export function modelOutputModality(model: AiModel | undefined): Modality | undefined {
  if (!model) return undefined;
  switch (model.group) {
    case 'images':
      return 'image';
    case 'videos':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return undefined;
  }
}

/**
 * The typed input handles a generation node should render for the given model.
 * A field gets a handle when it carries a `modality` AND it is either `required`
 * or part of an `exclusiveGroup` (exactly-one-of alternatives must each be wireable).
 * An `image_url_list` field is flagged `isList` → the multi "three dots" input.
 */
export function requiredHandlesForModel(modelId: string | undefined): TypedHandle[] {
  const model = getModelById(modelId);
  if (!model) return [];
  const handles: TypedHandle[] = [];
  for (const field of model.inputSchema.fields) {
    if (!field.modality) continue;
    const wireable = field.required || field.exclusiveGroup != null;
    if (!wireable) continue;
    handles.push({
      fieldName: field.name,
      label: field.label,
      modality: field.modality as Modality,
      isList: field.type === 'image_url_list',
      exclusiveGroup: field.exclusiveGroup,
    });
  }
  return handles;
}

// ── Block output modality ─────────────────────────────────────────────────────

/**
 * What modality a block's output port carries.
 *   - content: from params.modality (set when the content kind is chosen)
 *   - result:  the output modality of the generation block it is sourced from
 *   - generation: undefined (a generation block has no direct output port; its
 *                 product flows through a result block)
 */
export function blockOutputModality(block: FlowBlock, canvas: FlowCanvas): Modality | undefined {
  if (block.type === 'content') {
    return block.params.modality as Modality | undefined;
  }
  if (block.type === 'result') {
    const sourceId = block.params.sourceBlockId as string | undefined;
    const source = sourceId ? canvas.blocks.find((b) => b.blockId === sourceId) : undefined;
    if (source && source.type === 'generation') {
      return modelOutputModality(getModelById(source.params.modelId as string | undefined));
    }
    return undefined;
  }
  return undefined;
}

// ── Connection validation (AC-02 / AC-18) ─────────────────────────────────────

export type ConnectionInput = {
  sourceBlockId: string;
  sourceHandle: string;
  targetBlockId: string;
  targetHandle: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string; expectedModality?: Modality };

/**
 * Connect-time typed validation. A drop is accepted only when the source block's
 * output modality matches the modality of the target generation node's input handle.
 * An incompatible drop is REFUSED with the expected modality hint (AC-02). A result
 * block's output wired into a compatible input is accepted (AC-18).
 */
export function validateConnection(canvas: FlowCanvas, conn: ConnectionInput): ValidationResult {
  const source = canvas.blocks.find((b) => b.blockId === conn.sourceBlockId);
  const target = canvas.blocks.find((b) => b.blockId === conn.targetBlockId);
  if (!source || !target) {
    return { ok: false, reason: 'Connection references a block that no longer exists.' };
  }
  if (target.type !== 'generation') {
    return { ok: false, reason: 'Connections can only target a generation block input.' };
  }

  const handle = requiredHandlesForModel(target.params.modelId as string | undefined).find(
    (h) => h.fieldName === conn.targetHandle,
  );
  if (!handle) {
    return { ok: false, reason: 'This input is not available on the selected model.' };
  }

  const sourceModality = blockOutputModality(source, canvas);
  if (!sourceModality) {
    return {
      ok: false,
      reason: `This block has no output yet — it can't be connected to ${handle.label}.`,
      expectedModality: handle.modality,
    };
  }

  if (sourceModality !== handle.modality) {
    return {
      ok: false,
      reason: `${handle.label} accepts a ${handle.modality} input, not ${sourceModality}.`,
      expectedModality: handle.modality,
    };
  }

  return { ok: true };
}

// ── Model-change reconciliation (AC-07) ───────────────────────────────────────

export type ReconcileResult = {
  canvas: FlowCanvas;
  /** Edges removed because they no longer fit the new model's handles. */
  removedEdges: FlowEdge[];
};

/**
 * Apply a generation block's model change: update its modelId, rebuild its handles
 * (implicit — handles derive from the model at render), and prune any input edges
 * into that block that no longer fit (handle removed, or modality now mismatched).
 * Result blocks and their output edges are PRESERVED untouched (AC-07).
 */
export function reconcileModelChange(
  canvas: FlowCanvas,
  blockId: string,
  newModelId: string,
): ReconcileResult {
  const nextBlocks = canvas.blocks.map((b) =>
    b.blockId === blockId ? { ...b, params: { ...b.params, modelId: newModelId } } : b,
  );
  const nextCanvas: FlowCanvas = { blocks: nextBlocks, edges: canvas.edges };

  const removedEdges: FlowEdge[] = [];
  const keptEdges = canvas.edges.filter((edge) => {
    // Only input edges INTO the changed block can be invalidated by a model change.
    // Edges out of the block (e.g. into a result block) are never touched.
    if (edge.targetBlockId !== blockId) return true;
    const result = validateConnection(nextCanvas, {
      sourceBlockId: edge.sourceBlockId,
      sourceHandle: edge.sourceHandle,
      targetBlockId: edge.targetBlockId,
      targetHandle: edge.targetHandle,
    });
    if (result.ok) return true;
    removedEdges.push(edge);
    return false;
  });

  return { canvas: { blocks: nextBlocks, edges: keptEdges }, removedEdges };
}

// ── Block / edge removal ──────────────────────────────────────────────────────

/**
 * Removes a block and every edge incident to it (as source OR target), so deleting a
 * block never leaves a dangling connection. Pure — returns a new canvas document.
 */
export function removeBlockFromCanvas(canvas: FlowCanvas, blockId: string): FlowCanvas {
  return {
    blocks: canvas.blocks.filter((b) => b.blockId !== blockId),
    edges: canvas.edges.filter(
      (e) => e.sourceBlockId !== blockId && e.targetBlockId !== blockId,
    ),
  };
}

/** Removes a single edge (connection) by id. Pure — returns a new canvas document. */
export function removeEdgeFromCanvas(canvas: FlowCanvas, edgeId: string): FlowCanvas {
  return { ...canvas, edges: canvas.edges.filter((e) => e.edgeId !== edgeId) };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export type UseFlowCanvasOptions = {
  initialCanvas?: FlowCanvas;
  /** Called when a model change prunes edges, so the UI can tell the Creator. */
  onEdgesPruned?: (removed: FlowEdge[]) => void;
  /** Called when a connect-time drop is refused (modality mismatch). */
  onConnectionRejected?: (result: Extract<ValidationResult, { ok: false }>) => void;
};

/**
 * Owns the canvas document (blocks + edges) and exposes typed mutations.
 * The component layer (FlowCanvas.tsx, T17; Inspector, T18) calls these.
 */
export function useFlowCanvas(options: UseFlowCanvasOptions = {}) {
  const { onEdgesPruned, onConnectionRejected } = options;
  const [canvas, setCanvas] = useState<FlowCanvas>(
    options.initialCanvas ?? { blocks: [], edges: [] },
  );
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  const addContentBlock = useCallback((modality: Modality, position: { x: number; y: number }) => {
    const blockId = genId('content');
    const block: FlowBlock = {
      blockId,
      type: 'content',
      position,
      params:
        modality === 'text'
          ? { contentType: 'text', text: '', modality }
          : { contentType: 'asset', fileId: '', modality },
    };
    setCanvas((c) => ({ ...c, blocks: [...c.blocks, block] }));
    return blockId;
  }, []);

  const addGenerationBlock = useCallback((modelId: string, position: { x: number; y: number }) => {
    const blockId = genId('generation');
    const block: FlowBlock = { blockId, type: 'generation', position, params: { modelId } };
    setCanvas((c) => ({ ...c, blocks: [...c.blocks, block] }));
    return blockId;
  }, []);

  /**
   * Add a result block for a generation block, wiring the visible gen→result edge
   * (generation `out` → result `in`) so the produced result is connected on the canvas,
   * not just linked by `params.sourceBlockId`. When `jobId` is given the block is bound
   * to that run — the per-run discriminator that lets one generation block keep a
   * HISTORY of result blocks (U5/AC-01). Returns the new result blockId.
   */
  const addResultBlock = useCallback(
    (genBlockId: string | undefined, position: { x: number; y: number }, jobId?: string) => {
      const blockId = genId('result');
      const block: FlowBlock = {
        blockId,
        type: 'result',
        position,
        params: { sourceBlockId: genBlockId, ...(jobId ? { jobId } : {}) },
      };
      setCanvas((c) => {
        const edges: FlowEdge[] = genBlockId
          ? [
              ...c.edges,
              {
                edgeId: genId('edge'),
                sourceBlockId: genBlockId,
                sourceHandle: OUTPUT_HANDLE,
                targetBlockId: blockId,
                targetHandle: 'in',
              },
            ]
          : c.edges;
        return { ...c, blocks: [...c.blocks, block], edges };
      });
      return blockId;
    },
    [],
  );

  /** Attempt to add an edge; rejects (and reports) an incompatible drop. */
  const connect = useCallback(
    (conn: Connection): boolean => {
      const { source, target, sourceHandle, targetHandle } = conn;
      if (!source || !target) return false;
      const input: ConnectionInput = {
        sourceBlockId: source,
        sourceHandle: sourceHandle ?? OUTPUT_HANDLE,
        targetBlockId: target,
        targetHandle: targetHandle ?? '',
      };
      const result = validateConnection(canvasRef.current, input);
      if (!result.ok) {
        onConnectionRejected?.(result);
        return false;
      }
      const edge: FlowEdge = {
        edgeId: genId('edge'),
        sourceBlockId: input.sourceBlockId,
        sourceHandle: input.sourceHandle,
        targetBlockId: input.targetBlockId,
        targetHandle: input.targetHandle,
      };
      setCanvas((c) => ({ ...c, edges: [...c.edges, edge] }));
      return true;
    },
    [onConnectionRejected],
  );

  /** Pure validity check for xyflow's isValidConnection prop (accepts Edge | Connection). */
  const isValidConnection = useCallback((conn: Edge | Connection): boolean => {
    const { source, target, sourceHandle, targetHandle } = conn;
    if (!source || !target) return false;
    return validateConnection(canvasRef.current, {
      sourceBlockId: source,
      sourceHandle: sourceHandle ?? OUTPUT_HANDLE,
      targetBlockId: target,
      targetHandle: targetHandle ?? '',
    }).ok;
  }, []);

  /** Change a generation block's model, pruning now-incompatible edges (AC-07). */
  const changeModel = useCallback(
    (blockId: string, newModelId: string) => {
      const { canvas: next, removedEdges } = reconcileModelChange(
        canvasRef.current,
        blockId,
        newModelId,
      );
      setCanvas(next);
      if (removedEdges.length > 0) onEdgesPruned?.(removedEdges);
    },
    [onEdgesPruned],
  );

  /** Remove a block and all of its incident edges (× button / Delete key). */
  const removeBlock = useCallback((blockId: string) => {
    setCanvas((c) => removeBlockFromCanvas(c, blockId));
  }, []);

  /** Remove a single connection (Delete key on a selected edge). */
  const removeEdge = useCallback((edgeId: string) => {
    setCanvas((c) => removeEdgeFromCanvas(c, edgeId));
  }, []);

  /** The current canvas document, already in the server-authoritative FlowCanvas shape. */
  const serialize = useCallback((): FlowCanvas => canvasRef.current, []);

  const handles = useMemo(() => {
    const map: Record<string, TypedHandle[]> = {};
    for (const b of canvas.blocks) {
      if (b.type === 'generation') {
        map[b.blockId] = requiredHandlesForModel(b.params.modelId as string | undefined);
      }
    }
    return map;
  }, [canvas.blocks]);

  return {
    canvas,
    setCanvas,
    handles,
    addContentBlock,
    addGenerationBlock,
    addResultBlock,
    connect,
    isValidConnection,
    changeModel,
    removeBlock,
    removeEdge,
    serialize,
  };
}
