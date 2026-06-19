/**
 * motionGraphic.controller — T10
 *
 * Thin HTTP adapter for the AI Motion Graphic non-streaming CRUD surface (the six
 * operations the web-editor reads/writes). The SSE generate/refine endpoints are T11
 * and the storyboard attach endpoint is T12 — NOT here.
 *
 * Responsibilities:
 *   - Parse + Zod-validate path params / request bodies (400 on a bad shape).
 *   - Read the acting Creator from `req.user.userId` (auth.middleware).
 *   - Delegate to motionGraphic.service (T6), which owns ownership / existence hiding
 *     (AC-07) and the ready-state invariant (AC-06/AC-14).
 *   - Project the service's MotionGraphicWithChat / MotionGraphicRecord → the contract
 *     wire shapes (camelCase, ISO date-time, `chatTurns` array, `{ items, nextCursor }`).
 *   - Forward every typed error to next() — the central errorHandler (index.ts) maps the
 *     status + the `{ error, code? }` envelope. NotFoundError → opaque 404 (AC-07).
 *
 * Contract: docs/features/ai-motion-graphic/contracts/openapi.yaml
 *   - GET    /motion-graphics                  → listMotionGraphics      (AC-13)
 *   - POST   /motion-graphics                  → createMotionGraphic     (AC-01/AC-06)
 *   - GET    /motion-graphics/{id}             → getMotionGraphic        (AC-02/AC-07)
 *   - PATCH  /motion-graphics/{id}             → renameMotionGraphic     (AC-07)
 *   - POST   /motion-graphics/{id}/turns       → appendMotionGraphicTurn (AC-03/AC-14)
 *   - POST   /motion-graphics/{id}/duplicate   → duplicateMotionGraphic  (AC-12)
 */
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

import { ValidationError } from '@/lib/errors.js';
import * as motionGraphicService from '@/services/motionGraphic.service.js';
import {
  runAuthoringStream,
  type ChatTurn,
} from '@/services/motionGraphicAuthoring.service.js';
import type {
  MotionGraphicRecord,
  MotionGraphicWithChat,
  ChatTurnRecord,
} from '@/repositories/motionGraphic.repository.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

/** :id path param — a UUID-shaped graphic id. */
const idSchema = z.string().uuid();

/** ?cursor & ?limit query (openapi #/components/parameters Cursor + Limit). */
const listQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

/** POST /motion-graphics body (#/components/schemas/MotionGraphicCreate). */
const createBodySchema = z.object({
  prompt: z.string().min(1),
  durationSeconds: z.number().min(0),
  outcome: z.enum(['ready', 'failed']),
  code: z.string().nullable().optional(),
  errorMessage: z.string().max(512).nullable().optional(),
  title: z.string().min(1).max(255).nullable().optional(),
  fps: z.number().int().min(1).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
});

/** The Creator's acknowledged cost estimate (#/components/schemas/Money). */
const moneySchema = z.object({
  currency: z.string().min(1),
  amount: z.number().min(0),
});

/** POST /motion-graphics/generate body (#/components/schemas/GenerateRequest). */
const generateBodySchema = z.object({
  prompt: z.string().min(1),
  durationSeconds: z.number().min(0),
  acknowledgedCost: moneySchema.optional(),
});

/** POST /motion-graphics/{id}/refine body (#/components/schemas/RefineRequest). */
const refineBodySchema = z.object({
  instruction: z.string().min(1),
  acknowledgedCost: moneySchema.optional(),
});

/** PATCH /motion-graphics/{id} body (#/components/schemas/MotionGraphicRename). */
const renameBodySchema = z.object({
  title: z.string().min(1).max(255),
});

/** POST /motion-graphics/{id}/turns body (#/components/schemas/TurnCreate). */
const turnBodySchema = z.object({
  instruction: z.string().min(1),
  outcome: z.enum(['ready', 'failed']),
  code: z.string().nullable().optional(),
  errorMessage: z.string().max(512).nullable().optional(),
});

// ── Wire projection ─────────────────────────────────────────────────────────────

function toIso(value: Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Project a chat turn → ChatTurn wire shape (camelCase, ISO created_at). */
function mapTurn(turn: ChatTurnRecord): Record<string, unknown> {
  return {
    id: turn.id,
    role: turn.role,
    seq: turn.seq,
    content: turn.content,
    generatedCode: turn.generatedCode,
    outcome: turn.outcome,
    errorMessage: turn.errorMessage,
    createdAt: toIso(turn.createdAt),
  };
}

/** Project a full graphic + chat → MotionGraphic wire shape. */
function mapFull(withChat: MotionGraphicWithChat): Record<string, unknown> {
  const g = withChat.graphic;
  return {
    id: g.id,
    title: g.title,
    code: g.code,
    propsSchema: g.propsSchema ?? null,
    durationSeconds: g.durationSeconds,
    fps: g.fps,
    width: g.width,
    height: g.height,
    runtimeVersion: g.runtimeVersion,
    status: g.status,
    version: g.version,
    chatTurns: withChat.turns.map(mapTurn),
    createdAt: toIso(g.createdAt),
    updatedAt: toIso(g.updatedAt),
  };
}

/** Project a graphic record → MotionGraphicSummary wire shape (list + rename). */
function mapSummary(g: MotionGraphicRecord): Record<string, unknown> {
  return {
    id: g.id,
    title: g.title,
    durationSeconds: g.durationSeconds,
    status: g.status,
    version: g.version,
    createdAt: toIso(g.createdAt),
    updatedAt: toIso(g.updatedAt),
  };
}

/** Parse + validate the :id param, throwing ValidationError on a bad shape. */
function parseId(req: Request): string {
  const parsed = idSchema.safeParse(req.params['id']);
  if (!parsed.success) {
    throw new ValidationError('Invalid motion graphic id.');
  }
  return parsed.data;
}

function formatZod(error: z.ZodError): string {
  return `Invalid request body: ${error.issues.map((i) => i.message).join(', ')}`;
}

// ── GET /motion-graphics (AC-13) ────────────────────────────────────────────────

export async function listMotionGraphics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(formatZod(parsed.error));
    }

    const result = await motionGraphicService.list(userId, {
      limit: parsed.data.limit,
      cursor: parsed.data.cursor ?? null,
    });

    res.json({
      items: result.items.map(mapSummary),
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /motion-graphics (AC-01 ready / AC-06 failed) ──────────────────────────

export async function createMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(formatZod(parsed.error));
    }

    const created = await motionGraphicService.createFromVerdict(userId, {
      prompt: parsed.data.prompt,
      durationSeconds: parsed.data.durationSeconds,
      outcome: parsed.data.outcome,
      code: parsed.data.code ?? null,
      errorMessage: parsed.data.errorMessage ?? null,
      title: parsed.data.title ?? null,
      fps: parsed.data.fps,
      width: parsed.data.width,
      height: parsed.data.height,
    });

    res.status(201).json(mapFull(created));
  } catch (err) {
    next(err);
  }
}

// ── GET /motion-graphics/{id} (AC-02 + AC-07) ───────────────────────────────────

export async function getMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const id = parseId(req);

    const withChat = await motionGraphicService.getWithChat(userId, id);
    res.json(mapFull(withChat));
  } catch (err) {
    next(err);
  }
}

// ── PATCH /motion-graphics/{id} — rename (AC-07) ────────────────────────────────

export async function renameMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const id = parseId(req);
    const parsed = renameBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(formatZod(parsed.error));
    }

    const updated = await motionGraphicService.rename(userId, id, parsed.data.title);
    res.json(mapSummary(updated.graphic));
  } catch (err) {
    next(err);
  }
}

// ── POST /motion-graphics/{id}/turns — append turn (AC-03 / AC-14) ──────────────

export async function appendMotionGraphicTurn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const id = parseId(req);
    const parsed = turnBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(formatZod(parsed.error));
    }

    const updated = await motionGraphicService.appendTurn(userId, id, {
      instruction: parsed.data.instruction,
      outcome: parsed.data.outcome,
      code: parsed.data.code ?? null,
      errorMessage: parsed.data.errorMessage ?? null,
    });

    res.json(mapFull(updated));
  } catch (err) {
    next(err);
  }
}

// ── SSE authoring stream (T11) ──────────────────────────────────────────────────

/**
 * Project the optional `acknowledgedCost: { currency, amount }` (Money) to the
 * `clientEstimate` string the cost gate re-validates (T7 compares numerically via
 * parseFloat). Absent → null, so the cost gate rejects an unconfirmed estimate (AC-11).
 */
function toClientEstimate(acknowledgedCost?: { amount: number }): string | null {
  return acknowledgedCost ? String(acknowledgedCost.amount) : null;
}

/**
 * Open the SSE response and relay the authoring frames (ADR-0003).
 *
 * CRITICAL (sad.md §6): the pre-stream gates inside `runAuthoringStream` THROW before the
 * stream opens. We invoke it inside try/catch BEFORE writing a single SSE byte — so a thrown
 * GateError is forwarded to the central errorHandler as a JSON 4xx (`{error, code, details}`),
 * never an SSE error frame. We only set the `text/event-stream` headers from within `onFrame`,
 * i.e. lazily on the FIRST frame, which is reached only after all gates have passed. Once a
 * frame has been written the response is committed, so any later failure (already inside the
 * stream) surfaces as an SSE `error` frame, not a status change.
 *
 * These endpoints do NOT persist (sad.md §6 flows 1 & 3 — non-persisting): the browser
 * validates the streamed code and then calls POST /motion-graphics (T16) or
 * POST /{id}/turns (T17) to persist the verdict.
 */
async function streamAuthoring(
  res: Response,
  next: NextFunction,
  params: {
    mode: 'generate' | 'refine';
    prompt: string;
    durationSeconds: number;
    clientEstimate: string | null;
    history?: ChatTurn[];
  },
): Promise<void> {
  let headersSent = false;

  const onFrame = (wire: string): void => {
    // Lazily open the SSE response on the first frame (i.e. only after the gates passed).
    if (!headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      headersSent = true;
    }
    res.write(wire);
  };

  try {
    await runAuthoringStream({ ...params, onFrame });
  } catch (err) {
    // A pre-stream gate threw BEFORE any frame was written → JSON 4xx via errorHandler.
    if (!headersSent) {
      next(err);
      return;
    }
    // The stream was already open — we can no longer change the status. Surface the failure
    // as a terminal SSE error frame (defensive; runAuthoringStream normally frames its own).
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'The generation stream failed unexpectedly.' })}\n\n`);
  }

  if (headersSent) {
    res.end();
  }
}

// ── POST /motion-graphics/generate — stream a new graphic (AC-05 / AC-11) ────────

export async function generateMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    void req.user!.userId; // authenticated; generation is not yet owner-scoped (no row exists)
    const parsed = generateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(formatZod(parsed.error));
    }

    await streamAuthoring(res, next, {
      mode: 'generate',
      prompt: parsed.data.prompt,
      durationSeconds: parsed.data.durationSeconds,
      clientEstimate: toClientEstimate(parsed.data.acknowledgedCost),
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /motion-graphics/{id}/refine — stream a refinement (AC-07 / AC-11) ──────

export async function refineMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const id = parseId(req);
    const parsed = refineBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(formatZod(parsed.error));
    }

    // Owner check (AC-07) BEFORE streaming — non-owner / absent → NotFoundError → 404.
    const withChat = await motionGraphicService.getWithChat(userId, id);
    const history: ChatTurn[] = withChat.turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    await streamAuthoring(res, next, {
      mode: 'refine',
      prompt: parsed.data.instruction,
      durationSeconds: withChat.graphic.durationSeconds,
      clientEstimate: toClientEstimate(parsed.data.acknowledgedCost),
      history,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /motion-graphics/{id}/duplicate (AC-12) ────────────────────────────────

export async function duplicateMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const id = parseId(req);

    const copy = await motionGraphicService.duplicate(userId, id);
    res.status(201).json(mapFull(copy));
  } catch (err) {
    next(err);
  }
}
