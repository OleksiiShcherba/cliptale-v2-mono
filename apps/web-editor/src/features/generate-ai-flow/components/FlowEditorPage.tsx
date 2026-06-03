/**
 * T22 — FlowEditorPage
 *
 * The routable canvas editor at /generate-ai/:flowId. It ASSEMBLES the T17–T20
 * pieces that were built in isolation into one usable screen:
 *
 *   - loads the flow (getFlow → canvas + per-block job states) and feeds the canvas
 *     into FlowCanvas + useFlowCanvas;
 *   - an add-block toolbar (content / generation / result) + typed connections drawn
 *     on the canvas (FlowCanvas validates them);
 *   - the Inspector for the selected block (model params + content input);
 *   - useFlowAutosave wired to canvas edits (version-aware; 409 → a role=alert reload
 *     warning, AC-10b);
 *   - a per-block Generate button → estimate → CostConfirmModal → charged generate →
 *     the result block shows live progress then the dominant media preview, reattaching
 *     to a job that was already in flight on reopen (AC-01 / AC-08 / AC-08b).
 *
 * Job state + the preview URL are derived from polling the flow read (GET
 * /generation-flows/:id → jobs[]) while any job is non-terminal — a single
 * server-authoritative source that reattaches on reopen and restores on reload (AC-10),
 * independent of the realtime socket.
 *
 * Conventions: design tokens + page chrome idiom of FlowListPage; api.ts (never raw
 * fetch); react-query; inline styles (no CSS files).
 */

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';

import { getFlow, getFileUrl } from '../api';
import type { Flow, JobState } from '../types';
import type { FlowCanvas as FlowCanvasDoc, FlowBlock } from '@ai-video-editor/project-schema';

import { FlowCanvas } from './FlowCanvas';
import { Inspector } from './Inspector';
import { CostConfirmModal } from './CostConfirmModal';
import { FlowExtrasProvider, type FlowExtras } from './flowExtrasContext';
import { useFlowCanvas } from '../hooks/useFlowCanvas';
import { useFlowAutosave } from '../hooks/useFlowAutosave';
import { useFlowGeneration } from '../hooks/useFlowGeneration';
import {
  SURFACE_BASE,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  BORDER,
  PRIMARY,
  ERROR,
} from './flowNodeStyles';

// ── Constants ────────────────────────────────────────────────────────────────

const QUERY_KEY = (flowId: string) => ['generate-ai-flow', 'flow', flowId] as const;

/** Poll cadence for in-flight jobs (reattach / progress, AC-08b). */
const JOB_POLL_MS = 1_500;

/** Default model id for an added generation block (first catalog image model). */
const DEFAULT_MODEL_ID = 'fal-ai/nano-banana-2/edit';

type ControllerType = ReturnType<typeof useFlowCanvas>;

// ── Page ───────────────────────────────────────────────────────────────────

export function FlowEditorPage(): React.ReactElement {
  const { flowId } = useParams<{ flowId: string }>();
  const id = flowId ?? '';

  // Initial flow load (canvas + jobs). While any job is non-terminal the read is
  // polled so an in-flight generation reattaches and finishes live (AC-08b).
  const [hasPendingJob, setHasPendingJob] = React.useState(false);
  const { data: flow, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY(id),
    queryFn: () => getFlow(id),
    enabled: id.length > 0,
    refetchInterval: hasPendingJob ? JOB_POLL_MS : false,
  });

  if (isLoading) {
    return <ChromeMessage>Loading flow…</ChromeMessage>;
  }
  if (isError || !flow) {
    return (
      <ChromeMessage role="alert" color={ERROR}>
        Could not load this flow. It may have been deleted, or you may not have access.
      </ChromeMessage>
    );
  }

  return (
    <FlowEditor
      key={flow.flowId}
      flow={flow}
      onPendingJobChange={setHasPendingJob}
    />
  );
}

// ── Editor (mounted once the flow is loaded) ─────────────────────────────────

function FlowEditor({
  flow,
  onPendingJobChange,
}: {
  flow: Flow;
  onPendingJobChange: (pending: boolean) => void;
}): React.ReactElement {
  const initialCanvas = flow.canvas;

  const controllerRef = React.useRef<ControllerType | null>(null);
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const onCanvasReady = React.useCallback((c: ControllerType) => {
    controllerRef.current = c;
  }, []);

  // The live canvas document, streamed from FlowCanvas as it changes.
  const [canvas, setCanvas] = React.useState<FlowCanvasDoc>(initialCanvas);
  const onCanvasChange = React.useCallback((c: FlowCanvasDoc) => setCanvas(c), []);

  // ── Job states from the (polled) flow read — the reattach/preview source ─────
  const jobsByBlock = React.useMemo(() => {
    const map: Record<string, JobState> = {};
    for (const j of flow.jobs) map[j.blockId] = j;
    return map;
  }, [flow.jobs]);

  const anyPending = React.useMemo(
    () => flow.jobs.some((j) => j.status === 'queued' || j.status === 'running'),
    [flow.jobs],
  );
  React.useEffect(() => {
    onPendingJobChange(anyPending);
  }, [anyPending, onPendingJobChange]);

  // ── Autosave (version-aware; 409 → reload warning, AC-10b) ──────────────────
  const { conflict, status: autosaveStatus, localVersion } = useFlowAutosave({
    flowId: flow.flowId,
    version: flow.version,
    canvas,
  });

  // ── Generate spend gate, scoped to the generation block being generated ─────
  const [generatingBlockId, setGeneratingBlockId] = React.useState<string | null>(null);
  const resultBlockForGen = findResultBlock(canvas, generatingBlockId);
  const reattachState = generatingBlockId
    ? jobsByBlock[resultBlockForGen?.blockId ?? ''] ?? null
    : null;

  const generation = useFlowGeneration({
    flowId: flow.flowId,
    blockId: generatingBlockId ?? '',
    // F1/AC-01: generate against the autosave-bumped version, not the loaded one —
    // a stale version is rejected with 409, so any edit before Generate would fail.
    version: localVersion,
    initialJobState: reattachState,
  });

  // Pressing Generate selects the block; start() must run on the render where the
  // generation hook is bound to THIS block (else it would estimate an empty blockId).
  const [pendingStart, setPendingStart] = React.useState(false);
  const handleGenerate = React.useCallback((blockId: string) => {
    setGeneratingBlockId(blockId);
    setPendingStart(true);
  }, []);

  React.useEffect(() => {
    if (!pendingStart || !generatingBlockId) return;
    setPendingStart(false);
    void generation.start();
    // generation.start is recreated when blockId changes; run once the block is bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStart, generatingBlockId, generation.start]);

  // When a Generate is accepted (phase → tracking), ensure a result block exists for the
  // generating block so its live progress + produced media render, and kick a flow
  // refetch so the server-side canvas + job state (incl. the linked library asset) sync.
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (generation.phase !== 'tracking' || !generatingBlockId) return;
    const c = controllerRef.current;
    if (c) {
      const exists = c.canvas.blocks.some(
        (b) => b.type === 'result' && (b.params.sourceBlockId as string | undefined) === generatingBlockId,
      );
      if (!exists) {
        const genBlk = c.canvas.blocks.find((b) => b.blockId === generatingBlockId);
        const pos = genBlk ? { x: genBlk.position.x + 320, y: genBlk.position.y } : { x: 320, y: 0 };
        // Auto-create the result block AND the visible gen→result connection.
        c.addResultBlock(generatingBlockId, pos);
      }
    }
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY(flow.flowId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation.phase, generatingBlockId]);

  // ── Add-block toolbar ───────────────────────────────────────────────────────
  const addCounter = React.useRef(0);
  const nextPos = () => {
    addCounter.current += 1;
    return { x: 40 + addCounter.current * 24, y: 40 + addCounter.current * 24 };
  };

  // Content blocks come in all four modalities (AC-15) — a small menu off the toolbar
  // lets the Creator add text / image / audio / video, not just text (F3).
  const [contentMenuOpen, setContentMenuOpen] = React.useState(false);
  const addContent = (modality: 'text' | 'image' | 'audio' | 'video') => {
    controllerRef.current?.addContentBlock(modality, nextPos());
    setContentMenuOpen(false);
  };
  const handleAddGeneration = () =>
    controllerRef.current?.addGenerationBlock(DEFAULT_MODEL_ID, nextPos());
  const handleAddResult = () => {
    const c = controllerRef.current;
    if (!c) return;
    // A result block sourced from (and connected to) the most recent generation block.
    const gen = [...c.canvas.blocks].reverse().find((b) => b.type === 'generation');
    c.addResultBlock(gen?.blockId, nextPos());
  };

  // ── Model change → reconcile through the controller (rebuild handles + prune) ─
  const handleModelChange = React.useCallback((blockId: string, modelId: string) => {
    // changeModel prunes now-incompatible edges and fires onEdgesPruned → the notice
    // banner below, preserving any existing result block + its library link (AC-07).
    controllerRef.current?.changeModel(blockId, modelId);
  }, []);

  // ── Inspector param edits → write back through the controller ───────────────
  const handleBlockParamsChange = React.useCallback(
    (blockId: string, patch: Record<string, unknown>) => {
      controllerRef.current?.setCanvas((c) => ({
        ...c,
        blocks: c.blocks.map((b) =>
          b.blockId === blockId ? { ...b, params: { ...b.params, ...patch } } : b,
        ),
      }));
    },
    [],
  );

  // ── Resolve the preview URL for completed result blocks ─────────────────────
  const [previewUrls, setPreviewUrls] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    for (const job of flow.jobs) {
      if (job.status !== 'done') continue;
      if (previewUrls[job.blockId]) continue;
      if (job.resultUrl) {
        setPreviewUrls((p) => ({ ...p, [job.blockId]: job.resultUrl as string }));
      } else if (job.outputFileId) {
        void getFileUrl(job.outputFileId).then((url) => {
          if (url) setPreviewUrls((p) => ({ ...p, [job.blockId]: url }));
        });
      }
    }
  }, [flow.jobs, previewUrls]);

  // The live generation job (from useFlowGeneration) overlays the polled state for the
  // block currently being generated, so progress/preview update without a full refetch.
  const liveResultBlockId = resultBlockForGen?.blockId ?? null;
  React.useEffect(() => {
    const j = generation.job;
    if (!liveResultBlockId || !j) return;
    if (j.status === 'completed' && j.resultAssetId && !previewUrls[liveResultBlockId]) {
      void getFileUrl(j.resultAssetId).then((url) => {
        if (url) setPreviewUrls((p) => ({ ...p, [liveResultBlockId]: url }));
      });
    }
  }, [generation.job, liveResultBlockId, previewUrls]);

  // ── Dynamic per-block node data, delivered via context (NOT the nodes array) ──
  // The xyflow nodes are derived from the canvas document only, so each node is
  // measured once and stays visible; the volatile job/preview/handlers reach the node
  // components through FlowExtrasContext, which re-renders them in place.
  const lookupRef = React.useRef({ jobsByBlock, liveResultBlockId, liveJob: generation.job, previewUrls });
  lookupRef.current = { jobsByBlock, liveResultBlockId, liveJob: generation.job, previewUrls };
  const handleGenerateRef = React.useRef(handleGenerate);
  handleGenerateRef.current = handleGenerate;

  const flowExtras = React.useMemo<FlowExtras>(
    () => ({
      generation: () => ({
        onGenerate: (b) => handleGenerateRef.current(b),
        onSelectModel: setSelectedBlockId,
      }),
      result: (blockId) => {
        const s = lookupRef.current;
        const jobState = s.jobsByBlock[blockId] ?? null;
        const isLive = s.liveResultBlockId === blockId;
        const job = isLive && s.liveJob ? s.liveJob : jobStateToJob(jobState);
        return {
          job,
          previewUrl: s.previewUrls[blockId] ?? null,
          onRetry: () => {
            const blk = canvas.blocks.find((b) => b.blockId === blockId);
            const sourceGen = blk?.params.sourceBlockId as string | undefined;
            if (sourceGen) handleGenerateRef.current(sourceGen);
          },
        };
      },
      nodeActions: (blockId) => ({
        // Delete the block (+ its connections) and close the Inspector if it was showing it.
        onDelete: () => {
          controllerRef.current?.removeBlock(blockId);
          setSelectedBlockId((cur) => (cur === blockId ? null : cur));
        },
      }),
    }),
    // Re-create the value object on data changes so context consumers re-render with
    // fresh job/preview state (cheap — does NOT touch the xyflow nodes array).
    [jobsByBlock, liveResultBlockId, generation.job, previewUrls, canvas.blocks],
  );

  return (
    <div style={pageStyle}>
      {/* Top chrome + toolbar (FlowListPage idiom). */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <Link to="/?tab=generate-ai" aria-label="Home" style={homeLinkStyle}>
            ← Home
          </Link>
          <h1 style={titleStyle}>{flow.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span data-testid="autosave-status" style={{ fontSize: 11, color: TEXT_SECONDARY }}>
            {autosaveStatus} v{localVersion}
          </span>
          <div style={{ position: 'relative' }}>
            <ToolbarButton
              onClick={() => setContentMenuOpen((o) => !o)}
              label="Add content"
              aria-haspopup="menu"
              aria-expanded={contentMenuOpen}
            />
            {contentMenuOpen && (
              <div role="menu" style={menuStyle}>
                {(['text', 'image', 'audio', 'video'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitem"
                    aria-label={`Add ${m} content`}
                    onClick={() => addContent(m)}
                    style={menuItemStyle}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolbarButton onClick={handleAddGeneration} label="Add generation" />
          <ToolbarButton onClick={handleAddResult} label="Add result" />
        </div>
      </div>

      {/* Conflict warning (AC-10b) — first save wins; reload to continue. */}
      {conflict && (
        <div role="alert" style={alertStyle}>
          This flow was changed in another tab. Reload to continue editing.
        </div>
      )}
      {notice && (
        <div role="status" style={noticeStyle}>
          {notice}
        </div>
      )}
      {/* Generation error outside the gate (e.g. an estimate failure that returned to
          idle). A gate failure during confirm is shown inside the modal below. (F4) */}
      {generation.error && generation.phase !== 'confirming' && (
        <div role="alert" style={alertStyle}>
          {generation.error}
        </div>
      )}

      {/* Canvas + inspector. */}
      <div style={bodyStyle}>
        <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
          <FlowExtrasProvider value={flowExtras}>
            <FlowCanvas
              initialCanvas={initialCanvas}
              onCanvasReady={onCanvasReady}
              onCanvasChange={onCanvasChange}
              onConnectionRejected={(r) => setNotice(r.reason)}
              onEdgesPruned={(removed) =>
                setNotice(`${removed.length} connection${removed.length === 1 ? '' : 's'} removed — no longer valid for the chosen model.`)
              }
              onSelectBlock={setSelectedBlockId}
              selectedBlockId={selectedBlockId}
              onPaneClick={() => setSelectedBlockId(null)}
            />
          </FlowExtrasProvider>
        </div>
        <Inspector
          selectedBlockId={selectedBlockId}
          canvas={canvas}
          onBlockParamsChange={handleBlockParamsChange}
          onModelChange={handleModelChange}
        />
      </div>

      {/* Cost gate (AC-01 / AC-11). */}
      {generation.phase === 'confirming' && generation.estimate && (
        <CostConfirmModal
          estimate={generation.estimate}
          submitting={false}
          error={generation.error}
          onCancel={() => {
            generation.cancel();
            setGeneratingBlockId(null);
          }}
          onConfirm={() => {
            void generation.confirm();
          }}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function jobStateToJob(state: JobState | null) {
  if (!state) return null;
  const status =
    state.status === 'running'
      ? 'processing'
      : state.status === 'done'
        ? 'completed'
        : state.status === 'failed'
          ? 'failed'
          : 'queued';
  return {
    jobId: state.jobId,
    status: status as 'queued' | 'processing' | 'completed' | 'failed',
    progress: state.progress,
    resultAssetId: state.outputFileId,
    errorMessage: state.errorMessage,
  };
}

/** The result block downstream of a generation block (its sourceBlockId). */
function findResultBlock(canvas: FlowCanvasDoc, genBlockId: string | null): FlowBlock | null {
  if (!genBlockId) return null;
  return (
    canvas.blocks.find(
      (b) => b.type === 'result' && (b.params.sourceBlockId as string | undefined) === genBlockId,
    ) ?? null
  );
}

// ── Presentational chrome ─────────────────────────────────────────────────────

function ChromeMessage({
  children,
  role,
  color,
}: {
  children: React.ReactNode;
  role?: string;
  color?: string;
}): React.ReactElement {
  return (
    <div style={pageStyle}>
      <div
        role={role}
        style={{
          padding: 48,
          color: color ?? TEXT_SECONDARY,
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  ...rest
}: { onClick: () => void; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...rest}
      style={{
        padding: '6px 12px',
        background: 'transparent',
        color: TEXT_PRIMARY,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: SURFACE_BASE,
  fontFamily: 'Inter, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 24px',
  borderBottom: `1px solid ${BORDER}`,
  background: SURFACE_ELEVATED,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: TEXT_PRIMARY,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const homeLinkStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '6px 12px',
  background: 'transparent',
  color: TEXT_PRIMARY,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  textDecoration: 'none',
  cursor: 'pointer',
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

const alertStyle: React.CSSProperties = {
  padding: '8px 24px',
  background: '#3B1D1D',
  color: '#FCA5A5',
  fontSize: 13,
  borderBottom: `1px solid ${ERROR}`,
};

const noticeStyle: React.CSSProperties = {
  padding: '8px 24px',
  background: SURFACE_ELEVATED,
  color: PRIMARY,
  fontSize: 13,
  borderBottom: `1px solid ${BORDER}`,
};

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 140,
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: 4,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

const menuItemStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  background: 'transparent',
  color: TEXT_PRIMARY,
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
};
