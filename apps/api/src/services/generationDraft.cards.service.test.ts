/**
 * Unit tests for listStoryboardCardsForUser (generationDraft.service.ts).
 *
 * Covers:
 * - Text preview truncation at 140 chars
 * - Text preview from multiple TextBlocks concatenated
 * - Empty textPreview when no TextBlocks
 * - Media preview cap at 3
 * - Silent skip of missing/deleted assets (dangling refs)
 * - Status passthrough from the draft row
 * - Ownership: only the calling user's drafts are returned (SQL-level, asserted via stub)
 * - Empty list when user has no drafts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import { listStoryboardCardsForUser } from './generationDraft.service.js';
import type { GenerationDraftStatus } from '@/repositories/generationDraft.repository.js';
import {
  USER_ID,
  DRAFT_ID_1,
  DRAFT_ID_2,
  ASSET_VIDEO,
  ASSET_IMAGE_1,
  ASSET_IMAGE_2,
  ASSET_IMAGE_3,
  ASSET_IMAGE_4,
  ASSET_DELETED,
  makePromptDoc,
  makeDraftRow,
} from './generationDraft.cards.fixtures.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/generationDraft.repository.js', () => ({
  insertDraft: vi.fn(),
  findDraftById: vi.fn(),
  findDraftsByUserId: vi.fn(),
  updateDraftPromptDoc: vi.fn(),
  deleteDraft: vi.fn(),
  findStoryboardDraftsForUser: vi.fn(),
  findAssetPreviewsByIds: vi.fn(),
}));

// Also mock the bullmq queue used by other service functions
vi.mock('@/queues/bullmq.js', () => ({
  aiEnhanceQueue: { getJob: vi.fn() },
}));

vi.mock('@/queues/jobs/enqueue-enhance-prompt.js', () => ({
  enqueueEnhancePrompt: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generationDraft.service — listStoryboardCardsForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty asset results
    vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mockResolvedValue([]);
  });

  // ── Empty list ────────────────────────────────────────────────────────────

  it('should return an empty array when the user has no drafts', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([]);

    const result = await listStoryboardCardsForUser(USER_ID);

    expect(result).toEqual([]);
    expect(generationDraftRepository.findStoryboardDraftsForUser).toHaveBeenCalledWith(USER_ID);
    // No asset query needed when there are no drafts
    expect(generationDraftRepository.findAssetPreviewsByIds).not.toHaveBeenCalled();
  });

  // ── textPreview truncation ────────────────────────────────────────────────

  it('should produce a textPreview truncated to 140 chars from a single long TextBlock', async () => {
    const longText = 'A'.repeat(200);
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({ promptDoc: makePromptDoc([{ type: 'text', value: longText }]) }),
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.textPreview).toHaveLength(140);
    expect(card!.textPreview).toBe('A'.repeat(140));
  });

  it('should return the full text when it is shorter than 140 chars', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({ promptDoc: makePromptDoc([{ type: 'text', value: 'Short text' }]) }),
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.textPreview).toBe('Short text');
  });

  it('should concatenate multiple TextBlocks before truncating', async () => {
    // Two blocks of 80 chars each → concatenation is 160 chars → truncated to 140
    const block80 = 'B'.repeat(80);
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({
        promptDoc: makePromptDoc([
          { type: 'text', value: block80 },
          { type: 'text', value: block80 },
        ]),
      }),
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.textPreview).toHaveLength(140);
    expect(card!.textPreview).toBe('B'.repeat(140));
  });

  it('should produce an empty textPreview when the draft has no TextBlocks', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({
        promptDoc: makePromptDoc([
          { type: 'media-ref', mediaType: 'video', fileId: ASSET_VIDEO, label: 'Video' },
        ]),
      }),
    ]);
    vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mockResolvedValue([
      { fileId: ASSET_VIDEO, contentType: 'video/mp4', thumbnailUri: 'http://thumb.example.com/v.jpg' },
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.textPreview).toBe('');
  });

  // ── mediaPreviews cap at 3 ────────────────────────────────────────────────

  it('should cap mediaPreviews at 3 even when the draft has more than 3 MediaRefBlocks', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({
        promptDoc: makePromptDoc([
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_IMAGE_1, label: 'Img1' },
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_IMAGE_2, label: 'Img2' },
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_IMAGE_3, label: 'Img3' },
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_IMAGE_4, label: 'Img4' },
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_IMAGE_4, label: 'Img5' },
        ]),
      }),
    ]);
    vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mockResolvedValue([
      { fileId: ASSET_IMAGE_1, contentType: 'image/jpeg', thumbnailUri: null },
      { fileId: ASSET_IMAGE_2, contentType: 'image/jpeg', thumbnailUri: null },
      { fileId: ASSET_IMAGE_3, contentType: 'image/jpeg', thumbnailUri: null },
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    // Only the first 3 fileIds were passed to the repository
    const passedIds = vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mock.calls[0]![0];
    expect(passedIds).toHaveLength(3);
    expect(passedIds).toContain(ASSET_IMAGE_1);
    expect(passedIds).toContain(ASSET_IMAGE_2);
    expect(passedIds).toContain(ASSET_IMAGE_3);
    expect(passedIds).not.toContain(ASSET_IMAGE_4);

    expect(card!.mediaPreviews).toHaveLength(3);
  });

  // ── Missing/deleted asset silent skip ─────────────────────────────────────

  it('should silently skip missing/deleted assets without throwing', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({
        promptDoc: makePromptDoc([
          { type: 'media-ref', mediaType: 'video', fileId: ASSET_VIDEO, label: 'V' },
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_DELETED, label: 'deleted' },
        ]),
      }),
    ]);
    // Only ASSET_VIDEO comes back from the DB — ASSET_DELETED is absent
    vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mockResolvedValue([
      { fileId: ASSET_VIDEO, contentType: 'video/mp4', thumbnailUri: 'http://thumb/v.jpg' },
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.mediaPreviews).toHaveLength(1);
    expect(card!.mediaPreviews[0]!.fileId).toBe(ASSET_VIDEO);
  });

  it('should return empty mediaPreviews when all asset refs are deleted', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({
        promptDoc: makePromptDoc([
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_DELETED, label: 'gone' },
        ]),
      }),
    ]);
    vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mockResolvedValue([]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.mediaPreviews).toHaveLength(0);
  });

  // ── Status passthrough ────────────────────────────────────────────────────

  it('should pass through the status from the draft row', async () => {
    const statuses: GenerationDraftStatus[] = ['draft', 'step2', 'step3', 'completed'];

    for (const status of statuses) {
      vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
        makeDraftRow({ status }),
      ]);

      const [card] = await listStoryboardCardsForUser(USER_ID);
      expect(card!.status).toBe(status);
    }
  });

  // ── Ownership delegation to repository ───────────────────────────────────

  it('should pass the userId to findStoryboardDraftsForUser so the SQL owns the filter', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([]);

    await listStoryboardCardsForUser(USER_ID);

    expect(generationDraftRepository.findStoryboardDraftsForUser).toHaveBeenCalledWith(USER_ID);
  });

  // ── Multiple drafts — sorting delegated to DB ─────────────────────────────

  it('should return cards in the order the repository returns them', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({ id: DRAFT_ID_1, updatedAt: new Date('2026-02-01') }),
      makeDraftRow({ id: DRAFT_ID_2, updatedAt: new Date('2026-01-01') }),
    ]);

    const result = await listStoryboardCardsForUser(USER_ID);

    expect(result[0]!.draftId).toBe(DRAFT_ID_1);
    expect(result[1]!.draftId).toBe(DRAFT_ID_2);
  });

  // ── Media preview type resolved from content_type ─────────────────────────

  it('should set the correct media type from the content_type MIME', async () => {
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({
        promptDoc: makePromptDoc([
          { type: 'media-ref', mediaType: 'video', fileId: ASSET_VIDEO, label: 'V' },
          { type: 'media-ref', mediaType: 'image', fileId: ASSET_IMAGE_1, label: 'I' },
        ]),
      }),
    ]);
    vi.mocked(generationDraftRepository.findAssetPreviewsByIds).mockResolvedValue([
      { fileId: ASSET_VIDEO, contentType: 'video/mp4', thumbnailUri: 'http://thumb/v.jpg' },
      { fileId: ASSET_IMAGE_1, contentType: 'image/jpeg', thumbnailUri: null },
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.mediaPreviews[0]).toEqual({
      fileId: ASSET_VIDEO,
      type: 'video',
      thumbnailUrl: 'http://thumb/v.jpg',
    });
    expect(card!.mediaPreviews[1]).toEqual({
      fileId: ASSET_IMAGE_1,
      type: 'image',
      thumbnailUrl: null,
    });
  });

  // ── updatedAt passthrough ────────────────────────────────────────────────

  it('should pass through updatedAt from the draft row', async () => {
    const updatedAt = new Date('2026-03-15T10:30:00Z');
    vi.mocked(generationDraftRepository.findStoryboardDraftsForUser).mockResolvedValue([
      makeDraftRow({ updatedAt }),
    ]);

    const [card] = await listStoryboardCardsForUser(USER_ID);

    expect(card!.updatedAt).toEqual(updatedAt);
  });
});
