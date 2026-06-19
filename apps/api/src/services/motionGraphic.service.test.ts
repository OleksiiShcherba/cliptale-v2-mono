import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as motionGraphicRepository from '@/repositories/motionGraphic.repository.js';
import type {
  MotionGraphicRecord,
  ChatTurnRecord,
  MotionGraphicWithChat,
} from '@/repositories/motionGraphic.repository.js';
import { NotFoundError } from '@/lib/errors.js';
import {
  list,
  getWithChat,
  createFromVerdict,
  rename,
  appendTurn,
  duplicate,
} from './motionGraphic.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/motionGraphic.repository.js', () => ({
  insertMotionGraphic: vi.fn(),
  findMotionGraphicWithChat: vi.fn(),
  listMotionGraphicsByOwner: vi.fn(),
  updateMotionGraphicCode: vi.fn(),
  renameMotionGraphic: vi.fn(),
  appendChatTurn: vi.fn(),
  copyChatTurns: vi.fn(),
}));

const USER_ID = 'user-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'user-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GRAPHIC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeGraphic(overrides: Partial<MotionGraphicRecord> = {}): MotionGraphicRecord {
  return {
    id: GRAPHIC_ID,
    userId: USER_ID,
    title: 'Untitled motion graphic',
    code: 'export const C = () => null;',
    propsSchema: null,
    durationSeconds: 5,
    fps: 30,
    width: 1920,
    height: 1080,
    runtimeVersion: '4.0.443',
    status: 'ready',
    version: 1,
    createdAt: new Date('2026-06-19T00:00:00Z'),
    updatedAt: new Date('2026-06-19T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeTurn(overrides: Partial<ChatTurnRecord> = {}): ChatTurnRecord {
  return {
    id: 'turn-0',
    motionGraphicId: GRAPHIC_ID,
    role: 'user',
    seq: 0,
    content: 'make a title card',
    generatedCode: null,
    outcome: null,
    errorMessage: null,
    createdAt: new Date('2026-06-19T00:00:00Z'),
    ...overrides,
  };
}

function withChat(
  graphic: MotionGraphicRecord,
  turns: ChatTurnRecord[] = [],
): MotionGraphicWithChat {
  return { graphic, turns };
}

describe('motionGraphic.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── list (AC-13) ───────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns owner-scoped summaries and passes the userId through', async () => {
      vi.mocked(motionGraphicRepository.listMotionGraphicsByOwner).mockResolvedValue({
        items: [makeGraphic()],
        nextCursor: null,
      });

      const result = await list(USER_ID, { limit: 20 });

      expect(motionGraphicRepository.listMotionGraphicsByOwner).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, limit: 20 }),
      );
      expect(result.items).toHaveLength(1);
    });

    it('returns the empty state', async () => {
      vi.mocked(motionGraphicRepository.listMotionGraphicsByOwner).mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const result = await list(USER_ID, { limit: 20 });
      expect(result.items).toEqual([]);
    });
  });

  // ── getWithChat (AC-02 + AC-07 existence hiding) ─────────────────────────────

  describe('getWithChat', () => {
    it('returns the graphic + chat for the owner', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic(), [makeTurn()]),
      );

      const result = await getWithChat(USER_ID, GRAPHIC_ID);
      expect(result.graphic.id).toBe(GRAPHIC_ID);
      expect(result.turns).toHaveLength(1);
    });

    it('throws NotFoundError when the graphic is truly absent', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(null);
      await expect(getWithChat(USER_ID, GRAPHIC_ID)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError (NOT Forbidden) for a non-owner — AC-07 existence hiding', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ userId: OTHER_USER_ID })),
      );
      await expect(getWithChat(USER_ID, GRAPHIC_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ── createFromVerdict (AC-01 ready / AC-06 failed) ───────────────────────────

  describe('createFromVerdict', () => {
    it('ready → inserts a ready graphic with code, version, and auto-title sized to duration', async () => {
      vi.mocked(motionGraphicRepository.insertMotionGraphic).mockImplementation(
        async (p) => makeGraphic({ id: p.id, title: p.title, code: p.code ?? null, status: p.status ?? 'ready' }),
      );
      vi.mocked(motionGraphicRepository.appendChatTurn).mockResolvedValue(makeTurn());
      // The service re-reads the persisted state to return it.
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ status: 'ready' })),
      );

      const result = await createFromVerdict(USER_ID, {
        prompt: 'a glowing title card',
        durationSeconds: 8,
        outcome: 'ready',
        code: 'export const C = () => null;',
      });

      expect(motionGraphicRepository.insertMotionGraphic).toHaveBeenCalledOnce();
      const insertArg = vi.mocked(motionGraphicRepository.insertMotionGraphic).mock.calls[0]![0];
      expect(insertArg.userId).toBe(USER_ID);
      expect(insertArg.status).toBe('ready');
      expect(insertArg.code).toBe('export const C = () => null;');
      // auto-title mentions the duration
      expect(insertArg.title).toMatch(/8/);
      expect(result.graphic.status).toBe('ready');
    });

    it('failed → inserts a failed graphic with NULL code and records a failed assistant turn (AC-06)', async () => {
      vi.mocked(motionGraphicRepository.insertMotionGraphic).mockImplementation(
        async (p) => makeGraphic({ id: p.id, title: p.title, code: p.code ?? null, status: p.status ?? 'failed' }),
      );
      vi.mocked(motionGraphicRepository.appendChatTurn).mockResolvedValue(makeTurn());
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ status: 'failed', code: null })),
      );

      await createFromVerdict(USER_ID, {
        prompt: 'broken graphic',
        durationSeconds: 5,
        outcome: 'failed',
        errorMessage: 'did not render',
      });

      const insertArg = vi.mocked(motionGraphicRepository.insertMotionGraphic).mock.calls[0]![0];
      expect(insertArg.status).toBe('failed');
      expect(insertArg.code ?? null).toBeNull();

      // an assistant turn records the failure with errorMessage + outcome=failed
      const assistantCall = vi
        .mocked(motionGraphicRepository.appendChatTurn)
        .mock.calls.find((c) => c[0].role === 'assistant');
      expect(assistantCall).toBeDefined();
      expect(assistantCall![0].outcome).toBe('failed');
      expect(assistantCall![0].errorMessage).toBe('did not render');
    });

    it('honors a caller-supplied title instead of auto-generating', async () => {
      vi.mocked(motionGraphicRepository.insertMotionGraphic).mockImplementation(
        async (p) => makeGraphic({ id: p.id, title: p.title }),
      );
      vi.mocked(motionGraphicRepository.appendChatTurn).mockResolvedValue(makeTurn());
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ title: 'My Title' })),
      );

      await createFromVerdict(USER_ID, {
        prompt: 'x',
        durationSeconds: 3,
        outcome: 'ready',
        code: 'c',
        title: 'My Title',
      });
      const insertArg = vi.mocked(motionGraphicRepository.insertMotionGraphic).mock.calls[0]![0];
      expect(insertArg.title).toBe('My Title');
    });
  });

  // ── rename (AC-01 + AC-07) ───────────────────────────────────────────────────

  describe('rename', () => {
    it('renames an owned graphic', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic()),
      );
      vi.mocked(motionGraphicRepository.renameMotionGraphic).mockResolvedValue(true);
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValueOnce(
        withChat(makeGraphic()),
      );

      await rename(USER_ID, GRAPHIC_ID, 'New name');
      expect(motionGraphicRepository.renameMotionGraphic).toHaveBeenCalledWith(GRAPHIC_ID, 'New name');
    });

    it('throws NotFoundError for a non-owner and never calls the repo write (AC-07)', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ userId: OTHER_USER_ID })),
      );
      await expect(rename(USER_ID, GRAPHIC_ID, 'x')).rejects.toBeInstanceOf(NotFoundError);
      expect(motionGraphicRepository.renameMotionGraphic).not.toHaveBeenCalled();
    });
  });

  // ── appendTurn (AC-03 ready / AC-14 failed-keeps-last-working / AC-07) ────────

  describe('appendTurn', () => {
    it('ready → updates code + bumps version + appends user and assistant turns (AC-03)', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ code: 'old', version: 1 })),
      );
      vi.mocked(motionGraphicRepository.updateMotionGraphicCode).mockResolvedValue(true);
      vi.mocked(motionGraphicRepository.appendChatTurn).mockResolvedValue(makeTurn());

      await appendTurn(USER_ID, GRAPHIC_ID, {
        instruction: 'make it red',
        outcome: 'ready',
        code: 'new-code',
      });

      expect(motionGraphicRepository.updateMotionGraphicCode).toHaveBeenCalledWith(
        expect.objectContaining({ id: GRAPHIC_ID, code: 'new-code' }),
      );
      const roles = vi
        .mocked(motionGraphicRepository.appendChatTurn)
        .mock.calls.map((c) => c[0].role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });

    it('failed → keeps last working code/version and never calls updateMotionGraphicCode (AC-14)', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ code: 'working', version: 3, status: 'ready' })),
      );
      vi.mocked(motionGraphicRepository.appendChatTurn).mockResolvedValue(makeTurn());

      await appendTurn(USER_ID, GRAPHIC_ID, {
        instruction: 'break it',
        outcome: 'failed',
        errorMessage: 'compile error',
      });

      // AC-14: the working version is NOT overwritten.
      expect(motionGraphicRepository.updateMotionGraphicCode).not.toHaveBeenCalled();
      // The failed attempt is still recorded as an assistant turn.
      const assistantCall = vi
        .mocked(motionGraphicRepository.appendChatTurn)
        .mock.calls.find((c) => c[0].role === 'assistant');
      expect(assistantCall![0].outcome).toBe('failed');
      expect(assistantCall![0].errorMessage).toBe('compile error');
    });

    it('throws NotFoundError for a non-owner and writes nothing (AC-07)', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ userId: OTHER_USER_ID })),
      );
      await expect(
        appendTurn(USER_ID, GRAPHIC_ID, { instruction: 'x', outcome: 'ready', code: 'c' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(motionGraphicRepository.updateMotionGraphicCode).not.toHaveBeenCalled();
      expect(motionGraphicRepository.appendChatTurn).not.toHaveBeenCalled();
    });
  });

  // ── duplicate (AC-12 + AC-07) ────────────────────────────────────────────────

  describe('duplicate', () => {
    it('copies code + chat turns into a new same-owner graphic (AC-12)', async () => {
      const source = makeGraphic({ code: 'source-code', title: 'Original', durationSeconds: 7 });
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat)
        .mockResolvedValueOnce(withChat(source, [makeTurn()])) // ownership read
        .mockResolvedValueOnce(withChat(makeGraphic({ id: 'new-id', code: 'source-code' }), [makeTurn()])); // re-read copy
      vi.mocked(motionGraphicRepository.insertMotionGraphic).mockImplementation(
        async (p) => makeGraphic({ id: p.id, code: p.code ?? null, title: p.title }),
      );
      vi.mocked(motionGraphicRepository.copyChatTurns).mockResolvedValue(1);

      await duplicate(USER_ID, GRAPHIC_ID);

      const insertArg = vi.mocked(motionGraphicRepository.insertMotionGraphic).mock.calls[0]![0];
      expect(insertArg.userId).toBe(USER_ID);
      expect(insertArg.code).toBe('source-code');
      // chat copied as live re-runnable turns
      const copyArg = vi.mocked(motionGraphicRepository.copyChatTurns).mock.calls[0]![0];
      expect(copyArg.sourceId).toBe(GRAPHIC_ID);
      expect(copyArg.targetId).toBe(insertArg.id);
    });

    it('throws NotFoundError for a non-owner and copies nothing (AC-07)', async () => {
      vi.mocked(motionGraphicRepository.findMotionGraphicWithChat).mockResolvedValue(
        withChat(makeGraphic({ userId: OTHER_USER_ID })),
      );
      await expect(duplicate(USER_ID, GRAPHIC_ID)).rejects.toBeInstanceOf(NotFoundError);
      expect(motionGraphicRepository.insertMotionGraphic).not.toHaveBeenCalled();
      expect(motionGraphicRepository.copyChatTurns).not.toHaveBeenCalled();
    });
  });
});
