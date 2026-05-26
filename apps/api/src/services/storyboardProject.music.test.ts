import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClipRepo,
  mockFileLinksRepo,
  mockDraftRepo,
  mockProjectRepo,
  mockStoryboardRepo,
  mockReferenceRepo,
  mockMusicRepo,
  mockIllustrationRepo,
  mockVideoRepo,
  mockVersionRepo,
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
    mockReferenceRepo: { findActiveReferenceByDraftIdForUpdate: vi.fn() },
    mockMusicRepo: { findMusicBlocksByDraftIdForUpdate: vi.fn() },
    mockIllustrationRepo: { findLatestIllustrationJobsByDraftIdForUpdate: vi.fn() },
    mockVideoRepo: { findLatestVideoJobsByDraftIdForUpdate: vi.fn() },
    mockVersionRepo: {
      getConnection: vi.fn(() => mockConn),
      insertVersionTransaction: vi.fn(),
    },
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
vi.mock('@/repositories/storyboardMusic.repository.js', () => mockMusicRepo);
vi.mock('@/repositories/storyboardSceneIllustration.repository.js', () => mockIllustrationRepo);
vi.mock('@/repositories/storyboardSceneVideo.repository.js', () => mockVideoRepo);
vi.mock('@/repositories/version.repository.js', () => mockVersionRepo);
vi.mock('@/services/storyboardProjectDoc.service.js', () => mockStoryboardProjectDocService);

import { UnprocessableEntityError } from '@/lib/errors.js';
import { createProjectFromStoryboard } from './storyboardProject.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const DRAFT_ID = '00000000-0000-4000-8000-000000000002';
const BLOCK_ID = '00000000-0000-4000-8000-000000000020';
const VERSION_ID = 42;

function makeDraft() {
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
  };
}

function makeBlock() {
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
  };
}

function makeMusicBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000041',
    draftId: DRAFT_ID,
    name: 'Main music',
    sourceMode: 'generate_on_step3',
    prompt: 'Warm instrumental music',
    compositionPlan: null,
    existingFileId: null,
    startSceneBlockId: BLOCK_ID,
    endSceneBlockId: BLOCK_ID,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    volume: 0.75,
    fadeInS: 0,
    fadeOutS: 0,
    loopMode: 'trim',
    generationStatus: 'ready',
    generationJobId: '00000000-0000-4000-8000-000000000042',
    outputFileId: '00000000-0000-4000-8000-000000000043',
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeReference() {
  return {
    status: 'ready',
    outputFileId: '00000000-0000-4000-8000-000000000012',
    approvalStatus: 'approved',
  };
}

function makeIllustrationJob() {
  return {
    blockId: BLOCK_ID,
    status: 'ready',
    outputFileId: '00000000-0000-4000-8000-000000000023',
  };
}

describe('createProjectFromStoryboard music readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
    mockConn.release.mockReturnValue(undefined);
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValue(makeDraft());
    mockStoryboardRepo.findBlocksByDraftIdForUpdate.mockResolvedValue([makeBlock()]);
    mockStoryboardRepo.findEdgesByDraftIdForUpdate.mockResolvedValue([]);
    mockMusicRepo.findMusicBlocksByDraftIdForUpdate.mockResolvedValue([]);
    mockReferenceRepo.findActiveReferenceByDraftIdForUpdate.mockResolvedValue(makeReference());
    mockIllustrationRepo.findLatestIllustrationJobsByDraftIdForUpdate.mockResolvedValue([makeIllustrationJob()]);
    mockVideoRepo.findLatestVideoJobsByDraftIdForUpdate.mockResolvedValue([]);
    mockStoryboardProjectDocService.buildStoryboardProjectDoc.mockReturnValue({
      title: 'Storyboard project',
      projectDoc: { schemaVersion: 1 },
      clipInserts: [],
      usedFileIds: [],
    });
    mockProjectRepo.createProjectTransaction.mockResolvedValue({});
    mockClipRepo.insertClipsTransaction.mockResolvedValue(undefined);
    mockVersionRepo.insertVersionTransaction.mockResolvedValue({ versionId: VERSION_ID });
    mockDraftRepo.markDraftProjectAssemblyComplete.mockResolvedValue(undefined);
  });

  it('passes ready storyboard music blocks into assembly', async () => {
    const musicBlock = makeMusicBlock();
    mockMusicRepo.findMusicBlocksByDraftIdForUpdate.mockResolvedValue([musicBlock]);

    await createProjectFromStoryboard(USER_ID, DRAFT_ID);

    expect(mockStoryboardProjectDocService.buildStoryboardProjectDoc).toHaveBeenCalledWith(
      expect.objectContaining({ musicBlocks: [musicBlock] }),
    );
    expect(mockProjectRepo.createProjectTransaction).toHaveBeenCalledOnce();
  });

  it('rejects unresolved generated music before creating project rows', async () => {
    mockMusicRepo.findMusicBlocksByDraftIdForUpdate.mockResolvedValue([
      makeMusicBlock({ generationStatus: 'running', outputFileId: null }),
    ]);

    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(UnprocessableEntityError);

    expect(mockProjectRepo.createProjectTransaction).not.toHaveBeenCalled();
    expect(mockConn.rollback).toHaveBeenCalledOnce();
  });

  it('rejects music ranges that no longer match story order', async () => {
    mockMusicRepo.findMusicBlocksByDraftIdForUpdate.mockResolvedValue([
      makeMusicBlock({ startSceneBlockId: 'missing-scene' }),
    ]);

    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(UnprocessableEntityError);

    expect(mockProjectRepo.createProjectTransaction).not.toHaveBeenCalled();
  });
});
