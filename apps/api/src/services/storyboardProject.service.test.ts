import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClipRepo,
  mockFileLinksRepo,
  mockDraftRepo,
  mockProjectRepo,
  mockStoryboardRepo,
  mockReferenceRepo,
  mockIllustrationRepo,
  mockVersionRepo,
  mockStoryboardIllustrationService,
  mockStoryboardProjectDocService,
  mockConn,
} = vi.hoisted(() => {
  const mockConn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  return {
    mockClipRepo: { insertClipsTransaction: vi.fn() },
    mockFileLinksRepo: { linkFileToProjectTransaction: vi.fn() },
    mockDraftRepo: {
      lockDraftForProjectAssembly: vi.fn(),
      markDraftProjectAssemblyComplete: vi.fn(),
    },
    mockProjectRepo: { createProjectTransaction: vi.fn() },
    mockStoryboardRepo: {
      findBlocksByDraftIdForUpdate: vi.fn(),
      findEdgesByDraftIdForUpdate: vi.fn(),
    },
    mockReferenceRepo: {
      findActiveReferenceByDraftIdForUpdate: vi.fn(),
    },
    mockIllustrationRepo: { findLatestIllustrationJobsByDraftIdForUpdate: vi.fn() },
    mockVersionRepo: {
      getConnection: vi.fn(() => mockConn),
      insertVersionTransaction: vi.fn(),
    },
    mockStoryboardIllustrationService: { listStoryboardIllustrations: vi.fn() },
    mockStoryboardProjectDocService: { buildStoryboardProjectDoc: vi.fn() },
    mockConn,
  };
});

vi.mock('@/repositories/clip.repository.js', () => mockClipRepo);
vi.mock('@/repositories/fileLinks.repository.js', () => mockFileLinksRepo);
vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepo);
vi.mock('@/repositories/project.repository.js', () => mockProjectRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardIllustrationReference.repository.js', () => mockReferenceRepo);
vi.mock('@/repositories/storyboardSceneIllustration.repository.js', () => mockIllustrationRepo);
vi.mock('@/repositories/version.repository.js', () => mockVersionRepo);
vi.mock('@/services/storyboardIllustration.service.js', () => mockStoryboardIllustrationService);
vi.mock('@/services/storyboardProjectDoc.service.js', () => mockStoryboardProjectDocService);

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import { createProjectFromStoryboard } from './storyboardProject.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const DRAFT_ID = '00000000-0000-4000-8000-000000000002';
const PROJECT_ID = '00000000-0000-4000-8000-000000000003';
const VERSION_ID = 42;

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc: { schemaVersion: 1, blocks: [] },
    status: 'step2',
    createdProjectId: null,
    createdProjectVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

const BLOCK_ID = '00000000-0000-4000-8000-000000000020';

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: BLOCK_ID,
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: 'Scene 1',
    prompt: 'Scene prompt',
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mediaItems: [],
    ...overrides,
  };
}

function makeReference(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    draftId: DRAFT_ID,
    aiJobId: '00000000-0000-4000-8000-000000000011',
    status: 'ready',
    outputFileId: '00000000-0000-4000-8000-000000000012',
    sourceReferenceFileIds: [],
    approvalStatus: 'approved',
    approvedAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeIllustrationJob(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000021',
    draftId: DRAFT_ID,
    blockId: BLOCK_ID,
    aiJobId: '00000000-0000-4000-8000-000000000022',
    status: 'ready',
    outputFileId: '00000000-0000-4000-8000-000000000023',
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAssembly() {
  return {
    title: 'Storyboard project',
    projectDoc: {
      schemaVersion: 1,
      id: PROJECT_ID,
      title: 'Storyboard project',
      fps: 30,
      durationFrames: 150,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [],
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    },
    clipInserts: [{ clipId: 'clip-1' }],
    usedFileIds: ['file-1', 'file-2'],
  };
}

describe('createProjectFromStoryboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
    mockConn.release.mockReturnValue(undefined);
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValue(makeDraft());
    mockStoryboardRepo.findBlocksByDraftIdForUpdate.mockResolvedValue([makeBlock()]);
    mockStoryboardRepo.findEdgesByDraftIdForUpdate.mockResolvedValue([]);
    mockReferenceRepo.findActiveReferenceByDraftIdForUpdate.mockResolvedValue(makeReference());
    mockIllustrationRepo.findLatestIllustrationJobsByDraftIdForUpdate.mockResolvedValue([
      makeIllustrationJob(),
    ]);
    mockStoryboardProjectDocService.buildStoryboardProjectDoc.mockReturnValue(makeAssembly());
    mockProjectRepo.createProjectTransaction.mockResolvedValue({ projectId: PROJECT_ID, createdAt: new Date() });
    mockFileLinksRepo.linkFileToProjectTransaction.mockResolvedValue(true);
    mockClipRepo.insertClipsTransaction.mockResolvedValue(undefined);
    mockVersionRepo.insertVersionTransaction.mockResolvedValue({ versionId: VERSION_ID, createdAt: new Date() });
    mockDraftRepo.markDraftProjectAssemblyComplete.mockResolvedValue(undefined);
  });

  it('assembles and persists a storyboard project inside one transaction', async () => {
    const result = await createProjectFromStoryboard(USER_ID, DRAFT_ID);

    expect(result).toEqual({ projectId: expect.any(String), versionId: VERSION_ID });
    expect(mockConn.beginTransaction).toHaveBeenCalledOnce();
    expect(mockDraftRepo.lockDraftForProjectAssembly).toHaveBeenCalledWith(mockConn, DRAFT_ID);
    expect(mockStoryboardRepo.findBlocksByDraftIdForUpdate).toHaveBeenCalledWith(mockConn, DRAFT_ID);
    expect(mockStoryboardRepo.findEdgesByDraftIdForUpdate).toHaveBeenCalledWith(mockConn, DRAFT_ID);
    expect(mockReferenceRepo.findActiveReferenceByDraftIdForUpdate).toHaveBeenCalledWith(mockConn, DRAFT_ID);
    expect(mockIllustrationRepo.findLatestIllustrationJobsByDraftIdForUpdate).toHaveBeenCalledWith(
      mockConn,
      DRAFT_ID,
    );
    expect(mockProjectRepo.createProjectTransaction).toHaveBeenCalledWith(
      mockConn,
      expect.any(String),
      USER_ID,
      'Storyboard project',
    );
    expect(mockFileLinksRepo.linkFileToProjectTransaction).toHaveBeenCalledTimes(2);
    expect(mockClipRepo.insertClipsTransaction).toHaveBeenCalledWith(mockConn, [{ clipId: 'clip-1' }]);
    expect(mockVersionRepo.insertVersionTransaction).toHaveBeenCalledWith(
      mockConn,
      expect.objectContaining({
        docSchemaVersion: 1,
        parentVersionId: null,
        patches: [],
        inversePatches: [],
        createdByUserId: USER_ID,
      }),
    );
    expect(mockDraftRepo.markDraftProjectAssemblyComplete).toHaveBeenCalledWith(
      mockConn,
      expect.objectContaining({ draftId: DRAFT_ID, versionId: VERSION_ID }),
    );
    expect(mockConn.commit).toHaveBeenCalledOnce();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledOnce();
  });

  it('returns existing completion result without creating another project', async () => {
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValue(makeDraft({
      status: 'completed',
      createdProjectId: PROJECT_ID,
      createdProjectVersionId: VERSION_ID,
    }));

    const result = await createProjectFromStoryboard(USER_ID, DRAFT_ID);

    expect(result).toEqual({ projectId: PROJECT_ID, versionId: VERSION_ID });
    expect(mockProjectRepo.createProjectTransaction).not.toHaveBeenCalled();
    expect(mockVersionRepo.insertVersionTransaction).not.toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalledOnce();
  });

  it('preserves missing and wrong-owner semantics', async () => {
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValueOnce(null);
    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);

    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValueOnce(makeDraft({ userId: 'other-user' }));
    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);
  });

  it('rejects incomplete storyboard illustration state before writing project rows', async () => {
    mockIllustrationRepo.findLatestIllustrationJobsByDraftIdForUpdate.mockResolvedValue([
      makeIllustrationJob({ status: 'running', outputFileId: null }),
    ]);

    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );

    expect(mockProjectRepo.createProjectTransaction).not.toHaveBeenCalled();
    expect(mockConn.rollback).toHaveBeenCalledOnce();
  });

  it('rolls back failed writes so the draft can be retried', async () => {
    mockVersionRepo.insertVersionTransaction.mockRejectedValueOnce(new Error('version insert failed'));

    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow('version insert failed');

    expect(mockDraftRepo.markDraftProjectAssemblyComplete).not.toHaveBeenCalled();
    expect(mockConn.rollback).toHaveBeenCalledOnce();
    expect(mockConn.commit).not.toHaveBeenCalled();
  });
});
