import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';

const DRAFT_ID = '00000000-0000-4000-8000-00000000e801';
const PROJECT_ID = '00000000-0000-4000-8000-00000000e901';
const VERSION_ID = 8901;
const START_ID = '00000000-0000-4000-8000-00000000a801';
const SCENE_A_ID = '00000000-0000-4000-8000-00000000a802';
const SCENE_B_ID = '00000000-0000-4000-8000-00000000a803';
const END_ID = '00000000-0000-4000-8000-00000000a804';
const MUSIC_EXISTING_ID = '00000000-0000-4000-8000-00000000b801';
const MUSIC_GENERATE_NOW_ID = '00000000-0000-4000-8000-00000000b802';
const MUSIC_AUTO_ID = '00000000-0000-4000-8000-00000000b803';
const IMAGE_A_ID = '00000000-0000-4000-8000-00000000f801';
const IMAGE_B_ID = '00000000-0000-4000-8000-00000000f802';
const VIDEO_A_ID = '00000000-0000-4000-8000-00000000f803';
const VIDEO_B_ID = '00000000-0000-4000-8000-00000000f804';
const EXISTING_AUDIO_ID = '00000000-0000-4000-8000-00000000f805';
const GENERATED_NOW_AUDIO_ID = '00000000-0000-4000-8000-00000000f806';
const AUTO_AUDIO_ID = '00000000-0000-4000-8000-00000000f807';
const IMAGE_TRACK_ID = '00000000-0000-4000-8000-00000000d801';
const VIDEO_TRACK_ID = '00000000-0000-4000-8000-00000000d802';
const AUDIO_TRACK_ID = '00000000-0000-4000-8000-00000000d803';
const E2E_API_ORIGIN = new URL(E2E_API_URL).origin;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwV0WQAAAABJRU5ErkJggg==',
  'base64',
);
const MP3_STUB = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00]);

type MusicMode = 'existing' | 'generate_now' | 'generate_on_step3';
type GenerationStatus = 'queued' | 'running' | 'ready' | 'failed' | null;

type GeneratedMusicRequest = {
  path: string;
  blockId: string | null;
  prompt: string | null;
  sourceMode: MusicMode | null;
};

type StoryboardSavePayload = {
  blocks?: Array<{
    id: string;
    blockType: string;
    positionX: number;
    positionY: number;
  }>;
  musicBlocks?: Array<MusicBlock>;
};

type MusicBlock = {
  id: string;
  draftId: string;
  name: string;
  sourceMode: MusicMode;
  prompt: string | null;
  compositionPlan: {
    sections: Array<{
      section_name: string;
      duration_ms: number;
      lines: string[];
      positive_styles: string[];
      negative_styles: string[];
    }>;
  } | null;
  existingFileId: string | null;
  startSceneBlockId: string;
  endSceneBlockId: string;
  positionX: number;
  positionY: number;
  sortOrder: number;
  volume: number;
  fadeInS: number;
  fadeOutS: number;
  loopMode: 'trim' | 'loop';
  generationStatus: GenerationStatus;
  generationJobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true',
    },
    body: JSON.stringify(body),
  };
}

function scene(id: string, name: string, sortOrder: number, mediaFileId: string | null = null) {
  return {
    id,
    draftId: DRAFT_ID,
    blockType: 'scene',
    name,
    prompt: `${name} image prompt`,
    videoPrompt: `${name} video prompt`,
    durationS: sortOrder === 1 ? 2 : 3,
    positionX: sortOrder === 1 ? 340 : 620,
    positionY: 200,
    sortOrder,
    style: 'cinematic',
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
    mediaItems: mediaFileId
      ? [{ id: `media-${id}`, fileId: mediaFileId, mediaType: 'image', sortOrder: 0 }]
      : [],
  };
}

function sentinel(id: string, type: 'start' | 'end', sortOrder: number) {
  return {
    id,
    draftId: DRAFT_ID,
    blockType: type,
    name: null,
    prompt: null,
    videoPrompt: null,
    durationS: 0,
    positionX: type === 'start' ? 60 : 900,
    positionY: 200,
    sortOrder,
    style: null,
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
    mediaItems: [],
  };
}

function musicBlock(id: string, name: string, sortOrder: number, startSceneBlockId: string, endSceneBlockId: string): MusicBlock {
  const firstCoveredSceneX = startSceneBlockId === SCENE_B_ID ? 620 : 340;
  return {
    id,
    draftId: DRAFT_ID,
    name,
    sourceMode: 'generate_on_step3',
    prompt: `${name} instrumental bed`,
    compositionPlan: {
      sections: [{
        section_name: name,
        duration_ms: 5000,
        lines: [],
        positive_styles: ['cinematic', 'instrumental'],
        negative_styles: ['vocals', 'lyrics', 'singing'],
      }],
    },
    existingFileId: null,
    startSceneBlockId,
    endSceneBlockId,
    positionX: firstCoveredSceneX,
    positionY: 620 + sortOrder * 132,
    sortOrder,
    volume: 0.72,
    fadeInS: 0,
    fadeOutS: 1,
    loopMode: 'trim',
    generationStatus: null,
    generationJobId: null,
    outputFileId: null,
    errorMessage: null,
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  };
}

function initialStoryboardState() {
  return {
    blocks: [sentinel(START_ID, 'start', 0), sentinel(END_ID, 'end', 9999)],
    edges: [{
      id: '00000000-0000-4000-8000-00000000c801',
      draftId: DRAFT_ID,
      sourceBlockId: START_ID,
      targetBlockId: END_ID,
    }],
    musicBlocks: [],
  };
}

function appliedStoryboardState(musicBlocks: MusicBlock[]) {
  return {
    blocks: [
      sentinel(START_ID, 'start', 0),
      scene(SCENE_A_ID, 'Scene 01', 1, IMAGE_A_ID),
      scene(SCENE_B_ID, 'Scene 02', 2, IMAGE_B_ID),
      sentinel(END_ID, 'end', 9999),
    ],
    edges: [
      [START_ID, SCENE_A_ID],
      [SCENE_A_ID, SCENE_B_ID],
      [SCENE_B_ID, END_ID],
    ].map(([sourceBlockId, targetBlockId], index) => ({
      id: `00000000-0000-4000-8000-00000000c81${index}`,
      draftId: DRAFT_ID,
      sourceBlockId,
      targetBlockId,
    })),
    musicBlocks,
  };
}

function illustrationStatus() {
  return {
    automation: { phase: 'ready', planningJobId: null, errorMessage: null },
    reference: {
      status: 'ready',
      jobId: 'reference-job',
      outputFileId: '00000000-0000-4000-8000-00000000f808',
      sourceReferenceFileIds: [],
      approvalStatus: 'approved',
      errorMessage: null,
    },
    items: [
      { blockId: SCENE_A_ID, status: 'ready', jobId: 'image-job-a', outputFileId: IMAGE_A_ID, errorMessage: null },
      { blockId: SCENE_B_ID, status: 'ready', jobId: 'image-job-b', outputFileId: IMAGE_B_ID, errorMessage: null },
    ],
  };
}

function audioAsset(id: string, filename: string) {
  return {
    id,
    filename,
    displayName: filename,
    contentType: 'audio/mpeg',
    durationSeconds: 12,
    thumbnailUri: null,
    createdAt: '2026-05-26T10:00:00.000Z',
  };
}

function projectAsset(id: string, filename: string, contentType: string) {
  return {
    id,
    projectId: PROJECT_ID,
    filename,
    displayName: filename,
    contentType,
    downloadUrl: `https://signed.test/files/${id}/stream`,
    status: 'ready',
    durationSeconds: contentType.startsWith('audio/') ? 12 : null,
    width: contentType.startsWith('image/') || contentType.startsWith('video/') ? 1920 : null,
    height: contentType.startsWith('image/') || contentType.startsWith('video/') ? 1080 : null,
    fileSizeBytes: 128,
    thumbnailUri: null,
    waveformPeaks: contentType.startsWith('audio/') ? [0, 0.5, 0.25, 0.75, 0.2] : null,
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  };
}

function projectDoc(mode: 'images' | 'videos') {
  const visualTrackId = mode === 'videos' ? VIDEO_TRACK_ID : IMAGE_TRACK_ID;
  const visualType = mode === 'videos' ? 'video' : 'image';
  const visualA = mode === 'videos' ? VIDEO_A_ID : IMAGE_A_ID;
  const visualB = mode === 'videos' ? VIDEO_B_ID : IMAGE_B_ID;
  return {
    schemaVersion: 1,
    id: PROJECT_ID,
    title: 'Storyboard Music Project',
    fps: 30,
    durationFrames: 150,
    width: 1920,
    height: 1080,
    tracks: [
      { id: visualTrackId, type: 'video', name: mode === 'videos' ? 'Storyboard videos' : 'Storyboard scenes', muted: false, locked: false },
      { id: AUDIO_TRACK_ID, type: 'audio', name: 'Storyboard music', muted: false, locked: false },
    ],
    clips: [
      {
        id: '00000000-0000-4000-8000-00000000c901',
        type: visualType,
        fileId: visualA,
        trackId: visualTrackId,
        startFrame: 0,
        durationFrames: 60,
        trimInFrame: 0,
        opacity: 1,
        volume: 1,
      },
      {
        id: '00000000-0000-4000-8000-00000000c902',
        type: visualType,
        fileId: visualB,
        trackId: visualTrackId,
        startFrame: 60,
        durationFrames: 90,
        trimInFrame: 0,
        opacity: 1,
        volume: 1,
      },
      {
        id: '00000000-0000-4000-8000-00000000c903',
        type: 'audio',
        fileId: EXISTING_AUDIO_ID,
        trackId: AUDIO_TRACK_ID,
        startFrame: 0,
        durationFrames: 60,
        trimInFrame: 0,
        volume: 0.72,
      },
      {
        id: '00000000-0000-4000-8000-00000000c904',
        type: 'audio',
        fileId: GENERATED_NOW_AUDIO_ID,
        trackId: AUDIO_TRACK_ID,
        startFrame: 60,
        durationFrames: 90,
        trimInFrame: 0,
        volume: 0.72,
      },
      {
        id: '00000000-0000-4000-8000-00000000c905',
        type: 'audio',
        fileId: AUTO_AUDIO_ID,
        trackId: AUDIO_TRACK_ID,
        startFrame: 0,
        durationFrames: 150,
        trimInFrame: 0,
        volume: 0.72,
      },
    ],
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  };
}

async function installStoryboardMusicMocks(page: Page): Promise<{
  getUnexpectedApiRequests: () => string[];
  getProviderRequests: () => string[];
  getStoryboardSavePayloads: () => StoryboardSavePayload[];
  getMusicSavePayloads: () => unknown[];
  getMusicPatchPayloads: () => unknown[];
  getGeneratedMusicRequests: () => string[];
  getGeneratedMusicRequestDetails: () => GeneratedMusicRequest[];
  getProjectModes: () => string[];
  getProjectAssemblyViolations: () => string[];
  getAutoMusicReady: () => boolean;
  getMusicPollCount: () => number;
  getVideoReadyPollCount: () => number;
  getVideoStartPayloads: () => unknown[];
  getSceneMoveSaved: () => boolean;
}> {
  let storyboardApplied = true; // pipeline completes server-side before page open in the new flow
  let assembledMode: 'images' | 'videos' = 'images';
  let musicPollCount = 0;
  let autoMusicReady = false;
  let videosStarted = false;
  let videoPollCount = 0;
  let videoReadyPollCount = 0;
  let sceneMoveSaved = false;
  const musicBlocks = [
    musicBlock(MUSIC_EXISTING_ID, 'Existing track bed', 0, SCENE_A_ID, SCENE_A_ID),
    musicBlock(MUSIC_GENERATE_NOW_ID, 'Generate now bed', 1, SCENE_B_ID, SCENE_B_ID),
    musicBlock(MUSIC_AUTO_ID, 'Step 3 auto bed', 2, SCENE_A_ID, SCENE_B_ID),
  ];
  const unexpectedApiRequests: string[] = [];
  const providerRequests: string[] = [];
  const storyboardSavePayloads: StoryboardSavePayload[] = [];
  const musicSavePayloads: unknown[] = [];
  const musicPatchPayloads: unknown[] = [];
  const generatedMusicRequests: GeneratedMusicRequest[] = [];
  const projectModes: string[] = [];
  const projectAssemblyViolations: string[] = [];
  const videoStartPayloads: unknown[] = [];

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (/elevenlabs|openai|fal/i.test(url.hostname)) {
      providerRequests.push(`${request.method()} ${request.url()}`);
      await route.fulfill(jsonResponse({ error: 'Provider calls are not allowed in this E2E test' }, 599));
      return;
    }

    if (request.method() === 'GET' && url.origin === 'https://signed.test' && path.startsWith('/files/')) {
      const isAudio = path.includes(EXISTING_AUDIO_ID) || path.includes(GENERATED_NOW_AUDIO_ID) || path.includes(AUTO_AUDIO_ID);
      await route.fulfill({
        status: 200,
        contentType: isAudio ? 'audio/mpeg' : 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: isAudio ? MP3_STUB : PNG_1X1,
      });
      return;
    }

    if (request.method() === 'GET' && path === '/auth/me') {
      await route.fulfill(jsonResponse({
        userId: 'e2e-music-user',
        email: 'music-e2e@cliptale.test',
        displayName: 'Music E2E User',
      }));
      return;
    }

    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}`) {
      await route.fulfill(jsonResponse(storyboardApplied ? appliedStoryboardState(musicBlocks) : initialStoryboardState()));
      return;
    }

    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}/history`) {
      await route.fulfill(jsonResponse([]));
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${DRAFT_ID}/history`) {
      await route.fulfill(jsonResponse({ ok: true }, 201));
      return;
    }

    if (request.method() === 'PUT' && path === `/storyboards/${DRAFT_ID}`) {
      const body = request.postDataJSON() as StoryboardSavePayload;
      storyboardSavePayloads.push(body);
      if (body.blocks?.some((block) => block.id === SCENE_A_ID && Number(block.positionX) !== 340)) {
        sceneMoveSaved = true;
      }
      if (Array.isArray(body.musicBlocks)) {
        musicSavePayloads.push(body);
        for (const nextBlock of body.musicBlocks) {
          const index = musicBlocks.findIndex((block) => block.id === nextBlock.id);
          if (index >= 0) {
            const merged = { ...musicBlocks[index]!, ...nextBlock };
            musicBlocks[index] = merged.sourceMode === 'existing' && merged.existingFileId
              ? {
                  ...merged,
                  generationStatus: 'ready',
                  outputFileId: merged.existingFileId,
                  errorMessage: null,
                }
              : merged;
          } else {
            musicBlocks.push(nextBlock);
          }
        }
      }
      await route.fulfill(jsonResponse({ ok: true }));
      return;
    }

    if (request.method() === 'POST' && path === `/generation-drafts/${DRAFT_ID}/storyboard-plan`) {
      await route.fulfill(jsonResponse({ jobId: 'storyboard-music-plan-job', status: 'queued' }, 202));
      return;
    }

    if (request.method() === 'GET' && path === `/generation-drafts/${DRAFT_ID}/storyboard-plan/storyboard-music-plan-job`) {
      await route.fulfill(jsonResponse({
        jobId: 'storyboard-music-plan-job',
        status: 'completed',
        plan: {
          schemaVersion: 1,
          videoLengthSeconds: 5,
          sceneCount: 2,
          scenes: [],
          music: [],
        },
        errorMessage: null,
      }));
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${DRAFT_ID}/apply-latest-plan`) {
      storyboardApplied = true;
      await route.fulfill(jsonResponse(appliedStoryboardState(musicBlocks)));
      return;
    }

    if (
      (request.method() === 'GET' || request.method() === 'POST') &&
      path === `/storyboards/${DRAFT_ID}/illustrations`
    ) {
      await route.fulfill(jsonResponse(storyboardApplied ? illustrationStatus() : {
        automation: { phase: 'planning', planningJobId: null, errorMessage: null },
        reference: {
          status: 'queued',
          jobId: null,
          outputFileId: null,
          sourceReferenceFileIds: [],
          approvalStatus: 'pending',
          errorMessage: null,
        },
        items: [],
      }));
      return;
    }

    if (request.method() === 'GET' && path === `/generation-drafts/${DRAFT_ID}/assets`) {
      await route.fulfill(jsonResponse({
        items: [audioAsset(EXISTING_AUDIO_ID, 'existing-theme.mp3')],
        nextCursor: null,
        totals: { count: 1, bytesUsed: 7 },
      }));
      return;
    }

    if (request.method() === 'PATCH' && path.startsWith(`/storyboards/${DRAFT_ID}/music/`)) {
      const musicId = path.split('/').at(-1);
      const payload = request.postDataJSON() as Partial<MusicBlock>;
      musicPatchPayloads.push(payload);
      const index = musicBlocks.findIndex((block) => block.id === musicId);
      if (index >= 0) musicBlocks[index] = { ...musicBlocks[index]!, ...payload };
      await route.fulfill(jsonResponse(musicBlocks[index] ?? {}));
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${DRAFT_ID}/music/${MUSIC_GENERATE_NOW_ID}/generate`) {
      const block = musicBlocks.find((item) => item.id === MUSIC_GENERATE_NOW_ID)!;
      generatedMusicRequests.push({
        path,
        blockId: block.id,
        prompt: block.prompt,
        sourceMode: block.sourceMode,
      });
      Object.assign(block, {
        sourceMode: 'generate_now',
        generationStatus: 'ready',
        generationJobId: 'music-now-job',
        outputFileId: GENERATED_NOW_AUDIO_ID,
        errorMessage: null,
      });
      await route.fulfill(jsonResponse({ items: musicBlocks }));
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${DRAFT_ID}/music/generate-pending`) {
      const block = musicBlocks.find((item) => item.id === MUSIC_AUTO_ID)!;
      generatedMusicRequests.push({
        path,
        blockId: null,
        prompt: block.prompt,
        sourceMode: block.sourceMode,
      });
      Object.assign(block, {
        generationStatus: 'running',
        generationJobId: 'music-auto-job',
        outputFileId: null,
        errorMessage: null,
      });
      musicPollCount = 0;
      autoMusicReady = false;
      await route.fulfill(jsonResponse({ items: musicBlocks }));
      return;
    }

    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}/music`) {
      musicPollCount += 1;
      const block = musicBlocks.find((item) => item.id === MUSIC_AUTO_ID)!;
      if (block.generationStatus === 'running' && musicPollCount >= 1) {
        Object.assign(block, {
          generationStatus: 'ready',
          outputFileId: AUTO_AUDIO_ID,
          errorMessage: null,
        });
        autoMusicReady = true;
      }
      await route.fulfill(jsonResponse({ items: musicBlocks }));
      return;
    }

    if (request.method() === 'GET' && path === '/ai/models') {
      await route.fulfill(jsonResponse({
        image_to_video: [{
          id: 'fal-ai/mock-image-to-video',
          provider: 'fal',
          label: 'Mock Image to Video',
          capability: 'image_to_video',
          inputSchema: { fields: [{ name: 'prompt', type: 'string' }] },
        }],
      }));
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${DRAFT_ID}/videos`) {
      videosStarted = true;
      videoPollCount = 0;
      videoReadyPollCount = 0;
      videoStartPayloads.push(request.postDataJSON());
      await route.fulfill(jsonResponse({
        items: [
          { blockId: SCENE_A_ID, status: 'queued', jobId: 'video-job-a', modelId: 'fal-ai/mock-image-to-video', generateAudio: false, outputFileId: null, errorMessage: null },
          { blockId: SCENE_B_ID, status: 'queued', jobId: 'video-job-b', modelId: 'fal-ai/mock-image-to-video', generateAudio: false, outputFileId: null, errorMessage: null },
        ],
      }, 202));
      return;
    }

    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}/videos`) {
      videoPollCount += 1;
      const ready = videosStarted && videoPollCount >= 1;
      if (ready) {
        videoReadyPollCount += 1;
      }
      await route.fulfill(jsonResponse({
        items: [
          { blockId: SCENE_A_ID, status: ready ? 'ready' : 'running', jobId: 'video-job-a', modelId: 'fal-ai/mock-image-to-video', generateAudio: false, outputFileId: ready ? VIDEO_A_ID : null, errorMessage: null },
          { blockId: SCENE_B_ID, status: ready ? 'ready' : 'running', jobId: 'video-job-b', modelId: 'fal-ai/mock-image-to-video', generateAudio: false, outputFileId: ready ? VIDEO_B_ID : null, errorMessage: null },
        ],
      }));
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${DRAFT_ID}/project`) {
      const body = request.postDataJSON() as { mode?: 'images' | 'videos' };
      assembledMode = body.mode === 'videos' ? 'videos' : 'images';
      const autoBlock = musicBlocks.find((item) => item.id === MUSIC_AUTO_ID);
      const readyAutoMusic = autoMusicReady &&
        autoBlock?.generationStatus === 'ready' &&
        autoBlock.outputFileId === AUTO_AUDIO_ID;
      const violations = [
        readyAutoMusic ? null : 'project assembled before Step 3 auto music reached ready with AUTO_AUDIO_ID',
        assembledMode === 'videos' && videoReadyPollCount < 1
          ? 'video project assembled before a video-ready poll'
          : null,
      ].filter((message): message is string => Boolean(message));

      if (violations.length > 0) {
        projectAssemblyViolations.push(...violations);
        await route.fulfill(jsonResponse({ error: violations.join('; ') }, 599));
        return;
      }
      projectModes.push(assembledMode);
      await route.fulfill(jsonResponse({ projectId: PROJECT_ID, versionId: VERSION_ID }, 201));
      return;
    }

    if (request.method() === 'GET' && path === `/projects/${PROJECT_ID}/versions/latest`) {
      await route.fulfill(jsonResponse({
        versionId: VERSION_ID,
        docJson: projectDoc(assembledMode),
        createdAt: '2026-05-26T10:00:00.000Z',
      }));
      return;
    }

    if (request.method() === 'GET' && path === `/projects/${PROJECT_ID}/ui-state`) {
      await route.fulfill(jsonResponse({ state: null, updatedAt: null }));
      return;
    }

    if (request.method() === 'PUT' && path === `/projects/${PROJECT_ID}/ui-state`) {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      return;
    }

    if (request.method() === 'GET' && path === `/projects/${PROJECT_ID}/assets`) {
      await route.fulfill(jsonResponse({
        items: [
          projectAsset(IMAGE_A_ID, 'scene-a.png', 'image/png'),
          projectAsset(IMAGE_B_ID, 'scene-b.png', 'image/png'),
          projectAsset(VIDEO_A_ID, 'scene-a.mp4', 'video/mp4'),
          projectAsset(VIDEO_B_ID, 'scene-b.mp4', 'video/mp4'),
          projectAsset(EXISTING_AUDIO_ID, 'existing-theme.mp3', 'audio/mpeg'),
          projectAsset(GENERATED_NOW_AUDIO_ID, 'generated-now.mp3', 'audio/mpeg'),
          projectAsset(AUTO_AUDIO_ID, 'auto-step3.mp3', 'audio/mpeg'),
        ],
        nextCursor: null,
        totals: { count: 7, bytesUsed: 512 },
      }));
      return;
    }

    if (request.method() === 'GET' && path.startsWith('/assets/')) {
      const fileId = path.split('/')[2]!;
      const audioIds = new Set([EXISTING_AUDIO_ID, GENERATED_NOW_AUDIO_ID, AUTO_AUDIO_ID]);
      const videoIds = new Set([VIDEO_A_ID, VIDEO_B_ID]);
      const contentType = audioIds.has(fileId) ? 'audio/mpeg' : videoIds.has(fileId) ? 'video/mp4' : 'image/png';
      await route.fulfill(jsonResponse(projectAsset(fileId, `${fileId}.${contentType.split('/')[1]}`, contentType)));
      return;
    }

    if (request.method() === 'GET' && path.startsWith('/files/') && path.endsWith('/stream')) {
      const signedUrl = `https://signed.test${path}`;
      await route.fulfill(jsonResponse({ url: signedUrl }));
      return;
    }

    if (request.method() === 'GET' && path === `/projects/${PROJECT_ID}/renders`) {
      await route.fulfill(jsonResponse({ items: [] }));
      return;
    }

    // ── GET /generation-drafts/:id — draft metadata (draftOwnerId for UI) ──
    if (request.method() === 'GET' && path === `/generation-drafts/${DRAFT_ID}`) {
      await route.fulfill(jsonResponse({
        id: DRAFT_ID,
        userId: 'e2e-music-user',
        status: 'step2',
        createdAt: '2026-06-16T10:00:00.000Z',
      }));
      return;
    }

    // ── GET /users/me/settings — autosave interval + concurrency limit ────
    if (request.method() === 'GET' && path === '/users/me/settings') {
      await route.fulfill(jsonResponse({ autosaveIntervalSeconds: 60, updatedAt: null }));
      return;
    }

    // ── GET /references/blocks — no reference blocks in music tests ────────
    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}/references/blocks`) {
      await route.fulfill(jsonResponse({ items: [] }));
      return;
    }

    // ── GET /references/extraction — no cast extraction in music tests ─────
    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}/references/extraction`) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}', headers: { 'access-control-allow-origin': '*' } });
      return;
    }

    // ── POST /files/stream-urls — bulk signed URL fetcher ─────────────────
    if (request.method() === 'POST' && path === '/files/stream-urls') {
      const body = request.postDataJSON() as { fileIds?: string[] } | null;
      const fileIds = body?.fileIds ?? [];
      const urls: Record<string, string> = {};
      for (const fileId of fileIds) {
        urls[fileId] = `https://signed.test/files/${fileId}/stream`;
      }
      await route.fulfill(jsonResponse({ urls, missingFileIds: [] }));
      return;
    }

    // ── GET /pipeline — new pipeline state (storyboard-generation-pipeline) ──
    // Scenes are already generated server-side before the page opens; return
    // all phases completed so BlockingLoader never appears and the canvas loads
    // the applied storyboard state immediately.
    if (request.method() === 'GET' && path === `/storyboards/${DRAFT_ID}/pipeline`) {
      await route.fulfill(jsonResponse({
        draft_id: DRAFT_ID,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'completed' },
        },
        payload: null,
        version: 4,
        cost_estimate: null,
        error_message: null,
        updated_at: null,
      }));
      return;
    }

    if (url.origin === E2E_API_ORIGIN) {
      unexpectedApiRequests.push(`${request.method()} ${path}`);
      await route.fulfill(jsonResponse({ error: `Unexpected API request: ${request.method()} ${path}` }, 599));
      return;
    }

    await route.fallback();
  });

  return {
    getUnexpectedApiRequests: () => [...unexpectedApiRequests],
    getProviderRequests: () => [...providerRequests],
    getStoryboardSavePayloads: () => [...storyboardSavePayloads],
    getMusicSavePayloads: () => [...musicSavePayloads],
    getMusicPatchPayloads: () => [...musicPatchPayloads],
    getGeneratedMusicRequests: () => generatedMusicRequests.map((request) => request.path),
    getGeneratedMusicRequestDetails: () => [...generatedMusicRequests],
    getProjectModes: () => [...projectModes],
    getProjectAssemblyViolations: () => [...projectAssemblyViolations],
    getAutoMusicReady: () => autoMusicReady,
    getMusicPollCount: () => musicPollCount,
    getVideoReadyPollCount: () => videoReadyPollCount,
    getVideoStartPayloads: () => [...videoStartPayloads],
    getSceneMoveSaved: () => sceneMoveSaved,
  };
}

async function dragFirstScene(page: Page): Promise<void> {
  const sceneNode = page.getByTestId('scene-block-node').first();
  await expect(sceneNode).toBeVisible({ timeout: 15_000 });
  const box = await sceneNode.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 60, { steps: 5 });
  await page.mouse.up();
}

async function getVisibleBox(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Expected visible locator to have a bounding box');
  return box;
}

async function expectBelowWithoutOverlap(upper: Locator, lower: Locator): Promise<void> {
  const upperBox = await getVisibleBox(upper);
  const lowerBox = await getVisibleBox(lower);
  expect(lowerBox.y).toBeGreaterThanOrEqual(upperBox.y + upperBox.height);
}

async function expectVisibleMusicBlocksDoNotOverlap(page: Page, expectedCount: number): Promise<void> {
  const musicNodes = page.getByTestId('music-block-node');
  await expect(musicNodes).toHaveCount(expectedCount, { timeout: 15_000 });

  const boxes = await Promise.all(
    Array.from({ length: expectedCount }, async (_, index) => getVisibleBox(musicNodes.nth(index))),
  );

  for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
      const first = boxes[firstIndex]!;
      const second = boxes[secondIndex]!;
      const overlapsHorizontally = first.x < second.x + second.width && second.x < first.x + first.width;
      const overlapsVertically = first.y < second.y + second.height && second.y < first.y + first.height;
      expect(overlapsHorizontally && overlapsVertically).toBe(false);
    }
  }
}

async function expectDialogNearViewportCenter(page: Page): Promise<void> {
  const dialogBox = await getVisibleBox(page.getByRole('dialog', { name: 'Music block inspector' }));
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  const centerDeltaX = Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2);
  const centerDeltaY = Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2);
  expect(centerDeltaX).toBeLessThanOrEqual(16);
  expect(centerDeltaY).toBeLessThanOrEqual(16);
}

function expectCloseTo(actual: number, expected: number, label: string, tolerance = 2): void {
  expect(
    Math.abs(actual - expected),
    `${label}: expected ${actual} to be within ${tolerance}px of ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
}

function parseTransformScale(transform: string): number {
  if (!transform || transform === 'none') return 1;
  const matrixMatch = transform.match(/^matrix\(([^,]+)/);
  if (matrixMatch?.[1]) return Number(matrixMatch[1]) || 1;
  const matrix3dMatch = transform.match(/^matrix3d\(([^,]+)/);
  if (matrix3dMatch?.[1]) return Number(matrix3dMatch[1]) || 1;
  return 1;
}

function parseTranslatePosition(transform: string): { positionX: number; positionY: number } | null {
  if (!transform || transform === 'none') return null;
  const translateMatch = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\s*\)/);
  if (translateMatch?.[1] && translateMatch[2]) {
    return { positionX: Number(translateMatch[1]), positionY: Number(translateMatch[2]) };
  }
  const matrixMatch = transform.match(/^matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)$/);
  if (matrixMatch?.[1] && matrixMatch[2]) {
    return { positionX: Number(matrixMatch[1]), positionY: Number(matrixMatch[2]) };
  }
  return null;
}

async function getNodeCanvasPosition(locator: Locator): Promise<{ positionX: number; positionY: number }> {
  // React Flow applies the CSS transform on the outer .react-flow__node wrapper,
  // not on the inner content element. Walk up the DOM tree to find the first
  // ancestor whose computed transform is not "none".
  const transform = await locator.evaluate((element) => {
    const view = (
      element as {
        ownerDocument?: {
          defaultView?: {
            getComputedStyle?: (target: unknown) => { transform?: string };
          };
        };
      }
    ).ownerDocument?.defaultView;
    if (!view?.getComputedStyle) return 'none';
    let el: Element | null = element;
    while (el) {
      const t = view.getComputedStyle(el)?.transform ?? 'none';
      if (t && t !== 'none') return t;
      el = el.parentElement;
    }
    return 'none';
  });
  const position = parseTranslatePosition(String(transform));
  expect(position, `Expected node transform to expose canvas position, got ${String(transform)}`).not.toBeNull();
  if (!position) throw new Error(`Unable to parse node transform: ${String(transform)}`);
  return position;
}

async function expectSameElement(
  beforeHandle: NonNullable<Awaited<ReturnType<Locator['elementHandle']>>>,
  locator: Locator,
  label: string,
): Promise<void> {
  const currentHandle = await locator.elementHandle();
  expect(currentHandle, `${label} must still resolve to a DOM element`).not.toBeNull();
  if (!currentHandle) return;
  const isSame = await beforeHandle.evaluate(
    (before, current) => before === current,
    currentHandle,
  );
  expect(isSame, `${label} must remain the same DOM element during drag`).toBe(true);
}

function findSavedPosition(
  payload: StoryboardSavePayload,
  id: string,
  kind: 'block' | 'music',
): { positionX: number; positionY: number } | null {
  if (kind === 'music') {
    const musicBlock = payload.musicBlocks?.find((block) => block.id === id);
    return musicBlock
      ? { positionX: musicBlock.positionX, positionY: musicBlock.positionY }
      : null;
  }

  const block = payload.blocks?.find((item) => item.id === id);
  return block
    ? { positionX: block.positionX, positionY: block.positionY }
    : null;
}

async function dragAndAssertExactPreviewDrop(
  page: Page,
  getStoryboardSavePayloads: () => StoryboardSavePayload[],
  params: {
    label: string;
    locator: Locator;
    blockId: string;
    payloadKind: 'block' | 'music';
    delta: { x: number; y: number };
  },
): Promise<StoryboardSavePayload> {
  await expect(params.locator).toBeVisible({ timeout: 15_000 });
  const beforeHandle = await params.locator.elementHandle();
  expect(beforeHandle, `${params.label} must have a DOM element before drag`).not.toBeNull();
  if (!beforeHandle) throw new Error(`${params.label} elementHandle was null`);

  const beforeBox = await getVisibleBox(params.locator);
  const startX = beforeBox.x + beforeBox.width / 2;
  const startY = beforeBox.y + beforeBox.height / 2;
  const midX = startX + params.delta.x / 2;
  const midY = startY + params.delta.y / 2;
  const endX = startX + params.delta.x;
  const endY = startY + params.delta.y;
  const payloadStartIndex = getStoryboardSavePayloads().length;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(midX, midY, { steps: 6 });

  await expect(page.getByTestId('ghost-drag-clone')).toHaveCount(0);
  await expectSameElement(beforeHandle, params.locator, params.label);

  const midDragBox = await getVisibleBox(params.locator);
  expectCloseTo(midDragBox.width, beforeBox.width, `${params.label} width during drag`, 1);
  expectCloseTo(midDragBox.height, beforeBox.height, `${params.label} height during drag`, 1);

  await page.mouse.move(endX, endY, { steps: 6 });
  await expect(page.getByTestId('ghost-drag-clone')).toHaveCount(0);
  await expectSameElement(beforeHandle, params.locator, params.label);

  const droppedPreviewBox = await getVisibleBox(params.locator);
  await page.mouse.up();
  await expect(page.getByTestId('ghost-drag-clone')).toHaveCount(0);
  await expectSameElement(beforeHandle, params.locator, params.label);

  const afterDropBox = await getVisibleBox(params.locator);
  expectCloseTo(afterDropBox.width, beforeBox.width, `${params.label} width after drop`, 1);
  expectCloseTo(afterDropBox.height, beforeBox.height, `${params.label} height after drop`, 1);
  expectCloseTo(afterDropBox.x, droppedPreviewBox.x, `${params.label} x after mouseup`);
  expectCloseTo(afterDropBox.y, droppedPreviewBox.y, `${params.label} y after mouseup`);
  const expectedPosition = await getNodeCanvasPosition(params.locator);

  let matchedPayload: StoryboardSavePayload | null = null;
  await expect.poll(() => {
    matchedPayload = getStoryboardSavePayloads()
      .slice(payloadStartIndex)
      .find((candidate) => {
        const candidatePosition = findSavedPosition(candidate, params.blockId, params.payloadKind);
        return (
          candidatePosition !== null &&
          Math.abs(candidatePosition.positionX - expectedPosition.positionX) <= 2 &&
          Math.abs(candidatePosition.positionY - expectedPosition.positionY) <= 2
        );
      }) ?? null;
    return matchedPayload !== null;
  }, {
    message: `${params.label} autosave PUT payload should include dropped coordinates`,
    timeout: 10_000,
  }).toBe(true);
  const payload = matchedPayload;
  const savedPosition = findSavedPosition(payload, params.blockId, params.payloadKind);
  expect(savedPosition, `${params.label} must be present in autosave PUT payload`).not.toBeNull();
  if (!savedPosition) return payload;

  expectCloseTo(savedPosition.positionX, expectedPosition.positionX, `${params.label} saved positionX`);
  expectCloseTo(savedPosition.positionY, expectedPosition.positionY, `${params.label} saved positionY`);

  return payload;
}

async function prepareStoryboardMusicFlow(page: Page) {
  const mocks = await installStoryboardMusicMocks(page);
  await page.goto(`/storyboard/${DRAFT_ID}`);

  // With the new pipeline, scenes are applied server-side before the page opens.
  // The pipeline mock returns all phases completed so no BlockingLoader appears.
  await expect(page.getByTestId('scene-block-node')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('music-block-node')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByTestId('music-source-badge')).toHaveText(['Auto later', 'Auto later', 'Auto later']);

  await dragFirstScene(page);
  await expect.poll(mocks.getSceneMoveSaved, { timeout: 10_000 }).toBe(true);
  await expect(page.getByTestId('music-range-label').nth(2)).toHaveText('Scene 01 - Scene 02');

  await page.getByRole('button', { name: /Edit music Existing track bed/ }).click();
  const existingModal = page.getByTestId('music-block-modal');
  await expect(existingModal).toBeVisible();
  await existingModal.getByRole('button', { name: 'Existing track' }).click();
  await existingModal.getByTestId('music-audio-picker').selectOption(EXISTING_AUDIO_ID);
  await page.getByLabel('Close music inspector').click();
  await expect(page.getByTestId('music-source-badge').first()).toHaveText('Existing track');
  await expect(page.getByTestId('music-status-badge').first()).toHaveText('Ready');

  await page.getByRole('button', { name: /Edit music Generate now bed/ }).click();
  const generateNowModal = page.getByTestId('music-block-modal');
  await generateNowModal.getByRole('button', { name: 'Generate now' }).click();
  await generateNowModal.getByTestId('music-generate-button').click();
  await expect(page.getByTestId('music-status-badge').nth(1)).toHaveText('Ready', { timeout: 10_000 });
  await page.getByLabel('Close music inspector').click();

  await expect(page.getByTestId('music-source-badge')).toHaveText([
    'Existing track',
    'Generate now',
    'Auto later',
  ]);
  await expect(page.getByTestId('next-step3-button')).toBeEnabled();

  return mocks;
}

test.describe('Storyboard music E2E', () => {
  test.setTimeout(90_000);

  test('covers manual add, auto placement, per-block prompts, exact drag preview/drop, and centered modal regressions', async ({ page }) => {
    const mocks = await installStoryboardMusicMocks(page);
    await page.goto(`/storyboard/${DRAFT_ID}`);

    // Pipeline mock returns all phases completed; storyboard is pre-applied.
    await expect(page.getByTestId('scene-block-node')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId('music-block-node')).toHaveCount(3, { timeout: 15_000 });
    await expectVisibleMusicBlocksDoNotOverlap(page, 3);

    await expectBelowWithoutOverlap(
      page.getByTestId('scene-block-node').first(),
      page.getByRole('button', { name: /Edit music Step 3 auto bed/ }),
    );

    await page.getByTestId('add-music-block-button').click();
    await expect(page.getByTestId('music-block-node')).toHaveCount(4, { timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: 'Music block inspector' })).toBeVisible();
    await expectDialogNearViewportCenter(page);
    await expect.poll(() => {
      const payloads = mocks.getMusicSavePayloads() as Array<{ musicBlocks?: MusicBlock[] }>;
      return payloads.some((payload) =>
        payload.musicBlocks?.some((block) =>
          block.name === 'Music 4' &&
          block.sourceMode === 'generate_on_step3' &&
          block.startSceneBlockId === SCENE_A_ID &&
          block.endSceneBlockId === SCENE_B_ID,
        ),
      );
    }, { timeout: 10_000 }).toBe(true);
    await page.getByLabel('Close music inspector').click();

    await page.getByRole('button', { name: /Edit music Generate now bed/ }).click();
    const modal = page.getByTestId('music-block-modal');
    await modal.getByRole('button', { name: 'Generate now' }).click();
    await modal.getByTestId('music-prompt').fill('Edited prompt for second music only');
    await expect.poll(() => {
      const payloads = mocks.getMusicSavePayloads() as Array<{ musicBlocks?: MusicBlock[] }>;
      const lastPayload = payloads.at(-1);
      const editedBlock = lastPayload?.musicBlocks?.find((block) => block.id === MUSIC_GENERATE_NOW_ID);
      const otherBlock = lastPayload?.musicBlocks?.find((block) => block.id === MUSIC_AUTO_ID);
      return editedBlock?.prompt === 'Edited prompt for second music only' &&
        otherBlock?.prompt === 'Step 3 auto bed instrumental bed';
    }, { timeout: 10_000 }).toBe(true);

    await modal.getByTestId('music-generate-button').click();
    await expect.poll(() => {
      const payloads = mocks.getMusicPatchPayloads() as Array<Partial<MusicBlock>>;
      return payloads.some((payload) =>
        payload.prompt === 'Edited prompt for second music only' &&
        payload.sourceMode === 'generate_now',
      );
    }, { timeout: 10_000 }).toBe(true);
    await expect.poll(() => {
      const requests = mocks.getGeneratedMusicRequestDetails();
      return requests.some((request) =>
        request.path === `/storyboards/${DRAFT_ID}/music/${MUSIC_GENERATE_NOW_ID}/generate` &&
        request.blockId === MUSIC_GENERATE_NOW_ID &&
        request.prompt === 'Edited prompt for second music only' &&
        request.sourceMode === 'generate_now',
      );
    }, { timeout: 10_000 }).toBe(true);
    await page.getByLabel('Close music inspector').click();

    const dragCases = [
      {
        label: 'Scene Block',
        locator: page.getByTestId('scene-block-node').first(),
        blockId: SCENE_A_ID,
        payloadKind: 'block' as const,
        delta: { x: 80, y: 60 },
      },
      {
        label: 'Music Block',
        locator: page.getByTestId('music-block-node').first(),
        blockId: MUSIC_EXISTING_ID,
        payloadKind: 'music' as const,
        delta: { x: 120, y: 80 },
      },
      {
        label: 'START',
        locator: page.getByTestId('start-node'),
        blockId: START_ID,
        payloadKind: 'block' as const,
        delta: { x: 36, y: -44 },
      },
      {
        label: 'END',
        locator: page.getByTestId('end-node'),
        blockId: END_ID,
        payloadKind: 'block' as const,
        delta: { x: -72, y: 54 },
      },
    ];

    for (const dragCase of dragCases) {
      await dragAndAssertExactPreviewDrop(page, mocks.getStoryboardSavePayloads, dragCase);
    }

    expect(mocks.getStoryboardSavePayloads().length).toBeGreaterThanOrEqual(dragCases.length);
    await expect(page.getByTestId('music-block-modal')).not.toBeVisible();

    expect(mocks.getProviderRequests()).toEqual([]);
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });

  test('auto-plans music blocks, resolves existing/generate-now/Step 3 music, and hydrates image project audio clips', async ({ page }) => {
    const mocks = await prepareStoryboardMusicFlow(page);

    await page.getByTestId('next-step3-button').click();
    await expect(page.getByTestId('step3-generation-modal')).toBeVisible();
    await page.getByTestId('step3-skip-videos-button').click();

    // Road-map page assembles quickly in mocked env; wait for editor URL directly.
    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${PROJECT_ID}$`), { timeout: 20_000 });
    await expect.poll(mocks.getAutoMusicReady, { timeout: 10_000 }).toBe(true);
    expect(mocks.getMusicPollCount()).toBeGreaterThanOrEqual(1);
    expect(mocks.getProjectAssemblyViolations()).toEqual([]);
    await expect(page.getByRole('toolbar', { name: 'Playback controls' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Clip: image/ })).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Clip: audio/ })).toHaveCount(3);

    expect(mocks.getGeneratedMusicRequests()).toEqual(expect.arrayContaining([
      `/storyboards/${DRAFT_ID}/music/${MUSIC_GENERATE_NOW_ID}/generate`,
      `/storyboards/${DRAFT_ID}/music/generate-pending`,
    ]));
    expect(mocks.getProjectModes()).toEqual(['images']);
    expect(mocks.getProviderRequests()).toEqual([]);
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });

  test('waits for videos and Step 3 music before hydrating video project audio clips', async ({ page }) => {
    const mocks = await prepareStoryboardMusicFlow(page);

    await page.getByTestId('next-step3-button').click();
    await expect(page.getByTestId('step3-generation-modal')).toBeVisible();
    await page.getByTestId('step3-video-model-select').selectOption('fal-ai/mock-image-to-video');
    await page.getByTestId('step3-start-videos-button').click();

    // Road-map page assembles quickly in mocked env; wait for editor URL directly.
    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${PROJECT_ID}$`), { timeout: 20_000 });
    await expect.poll(mocks.getAutoMusicReady, { timeout: 10_000 }).toBe(true);
    await expect.poll(mocks.getVideoReadyPollCount, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    expect(mocks.getMusicPollCount()).toBeGreaterThanOrEqual(1);
    expect(mocks.getProjectAssemblyViolations()).toEqual([]);
    await expect(page.getByRole('button', { name: /Clip: video/ })).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Clip: audio/ })).toHaveCount(3);

    expect(mocks.getVideoStartPayloads()).toEqual([{ modelId: 'fal-ai/mock-image-to-video', generateAudio: false }]);
    expect(mocks.getProjectModes()).toEqual(['videos']);
    expect(mocks.getProviderRequests()).toEqual([]);
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });
});
