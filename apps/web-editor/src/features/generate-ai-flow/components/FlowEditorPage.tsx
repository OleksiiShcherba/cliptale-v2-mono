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
import { useParams, useLocation, Link } from 'react-router-dom';

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

/**
 * Horizontal offset of a result block from its generation block — the result ALWAYS
 * lands to the gen block's right with a small gap (gen node is ~200–260px wide).
 */
const RESULT_OFFSET_X = 320;

/**
 * Vertical gap between stacked result blocks of one generation block — each new run's
 * block lands this far ABOVE the previous one (newest on top, U5/AC-01 history).
 */
const RESULT_STACK_DY = 280;

type ControllerType = ReturnType<typeof useFlowCanvas>;

// ── Page ───────────────────────────────────────────────────────────────────

export function FlowEditorPage(): React.ReactElement {
  const { flowId } = useParams<{ flowId: string }>();
  const id = flowId ?? '';

  // AC-05: detect when this flow was opened from a storyboard reference block.
  // The navigation state carries `{ fromDraft: draftId }` (set by the block opener).
  const location = useLocation();
  const locationState = location.state as { fromDraft?: string } | null;
  const fromDraft = locationState?.fromDraft ?? null;

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
      fromDraft={fromDraft}
      onPendingJobChange={setHasPendingJob}
    />
  );
}

// ── Editor (mounted once the flow is loaded) ─────────────────────────────────

function FlowEditor({
  flow,
  fromDraft,
  onPendingJobChange,
}: {
  flow: Flow;
  /** AC-05: draftId when opened from a storyboard reference block. */
  fromDraft: string | null;
  onPendingJobChange: (pending: boolean) => void;
}): React.ReactElement {
  const initialCanvas = flow.canvas;

  const controllerRef = React.useRef<ControllerType | null>(null);
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const onCanvasReady = React.useCallback((c: ControllerType) => {
    controllerRef.current = c;
  }, []);

  // The live canvas document, streamed from FlowCanvas as it changes. The ref mirrors
  // it for effects that must read the CURRENT blocks without re-running on every edit —
  // the controller object captured by onCanvasReady is frozen at mount, so its `.canvas`
  // snapshot never sees blocks appended later in the session (V1, pass-17).
  const [canvas, setCanvas] = React.useState<FlowCanvasDoc>(initialCanvas);
  const onCanvasChange = React.useCallback((c: FlowCanvasDoc) => setCanvas(c), []);
  const canvasLiveRef = React.useRef(canvas);
  canvasLiveRef.current = canvas;

  // ── Job states from the (polled) flow read — the reattach/preview source ─────
  // A generation block keeps a HISTORY of runs (U5/AC-01): every job row is kept,
  // indexed by jobId, and each result block resolves the run it is bound to via
  // params.jobId. The latest run per generation block is still derived for the
  // reattach seed and as the fallback for LEGACY result blocks saved before the
  // per-run binding existed (no params.jobId).
  const jobsById = React.useMemo(() => {
    const map: Record<string, JobState> = {};
    for (const j of flow.jobs) map[j.jobId] = j;
    return map;
  }, [flow.jobs]);

  const latestJobByBlock = React.useMemo(() => {
    const map: Record<string, JobState> = {};
    for (const j of flow.jobs) {
      const cur = map[j.blockId];
      if (!cur || (j.createdAt ?? '') >= (cur.createdAt ?? '')) map[j.blockId] = j;
    }
    return map;
  }, [flow.jobs]);

  const anyPending = React.useMemo(
    () => flow.jobs.some((j) => j.status === 'queued' || j.status === 'processing'),
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
  // Jobs are keyed by the GENERATION block id (job.blockId from setFlowLink), so the
  // reattach seed is looked up by the generation block, not the result block.
  const reattachState = generatingBlockId ? latestJobByBlock[generatingBlockId] ?? null : null;

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

  // The result block bound to the run in flight (params.jobId === liveJobId) — the
  // target of the live job overlay. Legacy unbound blocks are never overlaid by a
  // NEW run, so a regeneration cannot visually overwrite prior output (U5/AC-01).
  const resultBlockForGen = findResultBlock(canvas, generatingBlockId, generation.liveJobId);

  // When a Generate is accepted (phase → tracking), APPEND a fresh result block for
  // this run — prior result blocks are retained as the history of runs (U5/AC-01) —
  // and kick a flow refetch so the server-side job state (incl. the linked library
  // asset) syncs. The new block lands right of its gen block, stacked ABOVE the
  // previous result (newest on top).
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (generation.phase !== 'tracking' || !generatingBlockId) return;
    const c = controllerRef.current;
    const runJobId = generation.liveJobId ?? undefined;
    if (c) {
      // Read the LIVE canvas (not the mount-frozen c.canvas snapshot), so blocks
      // appended earlier in this session are seen — else a 2nd in-session run
      // would compute the same stack Y and overlap the previous block (V1).
      const liveBlocks = canvasLiveRef.current.blocks;
      const alreadyBound =
        runJobId != null &&
        liveBlocks.some((b) => b.type === 'result' && b.params.jobId === runJobId);
      if (!alreadyBound) {
        // Back-compat: a LEGACY result block (saved before the per-run binding) has no
        // params.jobId and would otherwise mirror the newest run. Freeze it to the
        // PREVIOUS run now, so its output survives the regeneration.
        const prevJob = latestJobByBlock[generatingBlockId];
        if (prevJob) {
          c.setCanvas((cur) => ({
            ...cur,
            blocks: cur.blocks.map((b) =>
              b.type === 'result' &&
              (b.params.sourceBlockId as string | undefined) === generatingBlockId &&
              b.params.jobId == null
                ? { ...b, params: { ...b.params, jobId: prevJob.jobId } }
                : b,
            ),
          }));
        }

        const genBlk = liveBlocks.find((b) => b.blockId === generatingBlockId);
        const priorResults = liveBlocks.filter(
          (b) =>
            b.type === 'result' &&
            (b.params.sourceBlockId as string | undefined) === generatingBlockId,
        );
        const baseY = genBlk?.position.y ?? 0;
        const y = priorResults.length
          ? Math.min(...priorResults.map((b) => b.position.y)) - RESULT_STACK_DY
          : baseY;
        const pos = genBlk
          ? { x: genBlk.position.x + RESULT_OFFSET_X, y }
          : { x: RESULT_OFFSET_X, y };
        // Auto-create the run's result block AND the visible gen→result connection.
        c.addResultBlock(generatingBlockId, pos, runJobId);
      }
    }
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY(flow.flowId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation.phase, generation.liveJobId, generatingBlockId]);

  // ── Add-block toolbar ───────────────────────────────────────────────────────
  const addCounter = React.useRef(0);
  const nextPos = () => {
    addCounter.current += 1;
    return { x: 40 + addCounter.current * 24, y: 40 + addCounter.current * 24 };
  };

  const handleAddResult = () => {
    const c = controllerRef.current;
    if (!c) return;
    // A result block sourced from (and connected to) the most recent generation block,
    // ALWAYS placed to its right with a small gap (same rule as the auto-created
    // result on Generate) — never cascaded from the top-left like content blocks.
    const gen = [...c.canvas.blocks].reverse().find((b) => b.type === 'generation');
    const pos = gen ? { x: gen.position.x + RESULT_OFFSET_X, y: gen.position.y } : nextPos();
    c.addResultBlock(gen?.blockId, pos);
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
  // Keyed by JOB id (the per-run binding) so every result block in a generation
  // block's history resolves its own run's media (U5/AC-01). Only jobs some result
  // block actually shows are resolved: bound ones, plus the latest per generation
  // block (the legacy-fallback target).
  const [previewUrls, setPreviewUrls] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const needed = new Set<string>();
    for (const b of canvas.blocks) {
      if (b.type !== 'result') continue;
      const bound = b.params.jobId as string | undefined;
      if (bound) {
        needed.add(bound);
      } else {
        const sourceGen = b.params.sourceBlockId as string | undefined;
        const latest = sourceGen ? latestJobByBlock[sourceGen] : undefined;
        if (latest) needed.add(latest.jobId);
      }
    }
    for (const jobId of needed) {
      const job = jobsById[jobId];
      if (!job || job.status !== 'completed') continue;
      if (previewUrls[jobId]) continue;
      if (job.resultUrl) {
        setPreviewUrls((p) => ({ ...p, [jobId]: job.resultUrl as string }));
      } else if (job.outputFileId) {
        void getFileUrl(job.outputFileId).then((url) => {
          if (url) setPreviewUrls((p) => ({ ...p, [jobId]: url }));
        });
      }
    }
  }, [canvas.blocks, jobsById, latestJobByBlock, previewUrls]);

  // The live generation job (from useFlowGeneration) overlays the polled state for the
  // block currently being generated, so progress/preview update without a full refetch.
  const liveResultBlockId = resultBlockForGen?.blockId ?? null;
  React.useEffect(() => {
    const j = generation.job;
    if (!j) return;
    if (j.status === 'completed' && j.resultAssetId && !previewUrls[j.jobId]) {
      void getFileUrl(j.resultAssetId).then((url) => {
        if (url) setPreviewUrls((p) => ({ ...p, [j.jobId]: url }));
      });
    }
  }, [generation.job, previewUrls]);

  // ── Dynamic per-block node data, delivered via context (NOT the nodes array) ──
  // The xyflow nodes are derived from the canvas document only, so each node is
  // measured once and stays visible; the volatile job/preview/handlers reach the node
  // components through FlowExtrasContext, which re-renders them in place.
  const lookupRef = React.useRef({ jobsById, latestJobByBlock, liveResultBlockId, liveJob: generation.job, previewUrls });
  lookupRef.current = { jobsById, latestJobByBlock, liveResultBlockId, liveJob: generation.job, previewUrls };
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
        // A result block resolves the RUN it is bound to (params.jobId → jobsById),
        // so a generation block's history of result blocks each keep their own
        // output (U5/AC-01). LEGACY blocks saved before the binding existed have no
        // params.jobId — they fall back to the latest run of their sourceBlockId
        // (the pre-U5 behavior), so old flows still restore on reload (AC-10).
        const blk = canvas.blocks.find((b) => b.blockId === blockId);
        const sourceGen = blk?.params.sourceBlockId as string | undefined;
        const boundJobId = blk?.params.jobId as string | undefined;
        const jobState = boundJobId
          ? s.jobsById[boundJobId] ?? null
          : (sourceGen ? s.latestJobByBlock[sourceGen] : undefined) ?? null;
        // The live overlay only applies to the block bound to the run in flight —
        // and never with a stale job of a DIFFERENT run (the reattach seed).
        const isLive = s.liveResultBlockId === blockId;
        const liveMatches =
          s.liveJob != null && (boundJobId == null || s.liveJob.jobId === boundJobId);
        const job = isLive && liveMatches ? s.liveJob : jobStateToJob(jobState);
        const previewJobId = boundJobId ?? jobState?.jobId;
        return {
          job,
          previewUrl: previewJobId ? s.previewUrls[previewJobId] ?? null : null,
          onRetry: () => {
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
    [jobsById, latestJobByBlock, liveResultBlockId, generation.job, previewUrls, canvas.blocks],
  );

  return (
    <div style={pageStyle}>
      {/* Top chrome + toolbar (FlowListPage idiom). */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          {/* AC-05: show "Back to storyboard" when opened from a reference block;
              otherwise show the standard Home link. */}
          {fromDraft != null ? (
            <Link
              to={`/storyboard/${fromDraft}`}
              aria-label="Back to storyboard"
              style={homeLinkStyle}
            >
              ← Back to storyboard
            </Link>
          ) : (
            <Link to="/?tab=generate-ai" aria-label="Home" style={homeLinkStyle}>
              ← Home
            </Link>
          )}
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
  // JobStatusEnum IS the DB/shared AiJobStatus (queued|processing|completed|failed) —
  // pass it through; remapping here is what once turned 'completed' into 'queued'.
  return {
    jobId: state.jobId,
    status: state.status,
    progress: state.progress,
    resultAssetId: state.outputFileId,
    errorMessage: state.errorMessage,
  };
}

/**
 * The result block bound to a generation block's run in flight: prefer the block
 * carrying params.jobId === runJobId; fall back to a LEGACY unbound block (saved
 * before the per-run binding). A block bound to a DIFFERENT run is never returned —
 * the live overlay must not overwrite a prior run's output (U5/AC-01).
 */
function findResultBlock(
  canvas: FlowCanvasDoc,
  genBlockId: string | null,
  runJobId: string | null,
): FlowBlock | null {
  if (!genBlockId) return null;
  const sameSource = canvas.blocks.filter(
    (b) => b.type === 'result' && (b.params.sourceBlockId as string | undefined) === genBlockId,
  );
  if (runJobId) {
    const bound = sameSource.find((b) => b.params.jobId === runJobId);
    if (bound) return bound;
  }
  return sameSource.find((b) => b.params.jobId == null) ?? null;
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
