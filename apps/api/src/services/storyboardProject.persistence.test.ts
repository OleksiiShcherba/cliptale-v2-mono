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

import { ForbiddenError, NotFoundError } from '@/lib/errors.js';
import { createProjectFromStoryboard } from './storyboardProject.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const DRAFT_ID = '00000000-0000-4000-8000-000000000002';
const PROJECT_ID = '00000000-0000-4000-8000-000000000003';
const BLOCK_ID = '00000000-0000-4000-8000-000000000020';

describe('createProjectFromStoryboard persistence failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
    mockConn.release.mockReturnValue(undefined);
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValue({
      id: DRAFT_ID,
      userId: USER_ID,
      promptDoc: { schemaVersion: 1, blocks: [] },
      createdProjectId: null,
      createdProjectVersionId: null,
    });
    mockStoryboardRepo.findBlocksByDraftIdForUpdate.mockResolvedValue([{
      id: BLOCK_ID,
      blockType: 'scene',
      name: 'Scene 1',
      durationS: 5,
    }]);
    mockStoryboardRepo.findEdgesByDraftIdForUpdate.mockResolvedValue([]);
    mockMusicRepo.findMusicBlocksByDraftIdForUpdate.mockResolvedValue([]);
    mockReferenceRepo.findActiveReferenceByDraftIdForUpdate.mockResolvedValue({
      status: 'ready',
      outputFileId: '00000000-0000-4000-8000-000000000012',
      approvalStatus: 'approved',
    });
    mockIllustrationRepo.findLatestIllustrationJobsByDraftIdForUpdate.mockResolvedValue([{
      blockId: BLOCK_ID,
      status: 'ready',
      outputFileId: '00000000-0000-4000-8000-000000000023',
    }]);
    mockVideoRepo.findLatestVideoJobsByDraftIdForUpdate.mockResolvedValue([{
      blockId: BLOCK_ID,
      status: 'ready',
      outputFileId: '00000000-0000-4000-8000-000000000033',
    }]);
    mockStoryboardProjectDocService.buildStoryboardProjectDoc.mockReturnValue({
      title: 'Storyboard project',
      projectDoc: { schemaVersion: 1 },
      clipInserts: [{ clipId: 'clip-1' }],
      usedFileIds: ['file-1', 'file-2'],
    });
    mockProjectRepo.createProjectTransaction.mockResolvedValue({});
    mockFileLinksRepo.linkFileToProjectTransaction.mockResolvedValue(true);
    mockClipRepo.insertClipsTransaction.mockResolvedValue(undefined);
    mockVersionRepo.insertVersionTransaction.mockResolvedValue({ versionId: 42 });
    mockDraftRepo.markDraftProjectAssemblyComplete.mockResolvedValue(undefined);
  });

  it('rolls back failed writes so the draft can be retried', async () => {
    mockVersionRepo.insertVersionTransaction.mockRejectedValueOnce(new Error('version insert failed'));

    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow('version insert failed');

    expect(mockDraftRepo.markDraftProjectAssemblyComplete).not.toHaveBeenCalled();
    expect(mockConn.rollback).toHaveBeenCalledOnce();
    expect(mockConn.commit).not.toHaveBeenCalled();
  });

  it('preserves missing and wrong-owner semantics', async () => {
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValueOnce(null);
    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);

    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValueOnce({
      id: DRAFT_ID,
      userId: 'other-user',
      promptDoc: { schemaVersion: 1, blocks: [] },
      createdProjectId: null,
      createdProjectVersionId: null,
    });
    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);
  });

  it('returns existing completion result without creating another project', async () => {
    mockDraftRepo.lockDraftForProjectAssembly.mockResolvedValue({
      id: DRAFT_ID,
      userId: USER_ID,
      promptDoc: { schemaVersion: 1, blocks: [] },
      createdProjectId: PROJECT_ID,
      createdProjectVersionId: 42,
    });

    const result = await createProjectFromStoryboard(USER_ID, DRAFT_ID);

    expect(result).toEqual({ projectId: PROJECT_ID, versionId: 42 });
    expect(mockProjectRepo.createProjectTransaction).not.toHaveBeenCalled();
    expect(mockVersionRepo.insertVersionTransaction).not.toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalledOnce();
  });

  it('rolls back and stops assembly when linking a file to the project fails', async () => {
    mockFileLinksRepo.linkFileToProjectTransaction.mockRejectedValueOnce(new Error('file link failed'));

    await expect(createProjectFromStoryboard(USER_ID, DRAFT_ID, 'videos')).rejects.toThrow('file link failed');

    expect(mockProjectRepo.createProjectTransaction).toHaveBeenCalledOnce();
    expect(mockClipRepo.insertClipsTransaction).not.toHaveBeenCalled();
    expect(mockVersionRepo.insertVersionTransaction).not.toHaveBeenCalled();
    expect(mockDraftRepo.markDraftProjectAssemblyComplete).not.toHaveBeenCalled();
    expect(mockConn.rollback).toHaveBeenCalledOnce();
    expect(mockConn.commit).not.toHaveBeenCalled();
  });
});
