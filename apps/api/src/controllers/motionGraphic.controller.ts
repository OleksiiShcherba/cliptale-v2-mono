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
