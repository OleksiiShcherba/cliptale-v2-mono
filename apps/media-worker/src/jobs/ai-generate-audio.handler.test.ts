import { describe, it, expect, vi, beforeEach } from 'vitest';

import { processElevenLabsCapability } from './ai-generate-audio.handler.js';
import {
  BUCKET,
  JOB_ID,
  AUDIO_BYTES,
  COMPOSITION_PLAN,
  USER_ID,
  makeMocks,
  makeDeps,
  makeData,
} from './ai-generate-audio.handler.fixtures.js';

// ── text_to_speech ────────────────────────────────────────────────────────────

describe('processElevenLabsCapability / text_to_speech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('updates progress to 30 before calling ElevenLabs', async () => {
    const m = makeMocks();
    const deps = makeDeps(m);
    const data = makeData({
      capability: 'text_to_speech',
      options: { text: 'Hi' },
    });

    await processElevenLabsCapability(data, deps);

    const progressCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('SET progress = ?'),
    );
    expect(progressCall).toBeTruthy();
    expect(progressCall![1]).toEqual([30, JOB_ID]);
  });

  it('calls textToSpeech with apiKey, text and optional voice/stability params', async () => {
    const m = makeMocks();
    const deps = makeDeps(m);
    const data = makeData({
      capability: 'text_to_speech',
      options: { text: 'Hi', voice_id: 'v-abc', stability: 0.6, similarity_boost: 0.8 },
    });

    await processElevenLabsCapability(data, deps);

    expect(m.textToSpeech).toHaveBeenCalledOnce();
    const [ttsParams] = m.textToSpeech.mock.calls[0]!;
    expect(ttsParams.text).toBe('Hi');
    expect(ttsParams.voiceId).toBe('v-abc');
    expect(ttsParams.stability).toBe(0.6);
    expect(ttsParams.similarityBoost).toBe(0.8);
    expect(ttsParams.apiKey).toBe('el-test-key');
  });

  it('uploads audio to S3 with correct key format (ai-generations/{userId}/{fileId}.mp3)', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    expect(m.s3Send).toHaveBeenCalledOnce();
    const s3Cmd = m.s3Send.mock.calls[0]![0] as { input: { Bucket: string; Key: string; ContentType: string } };
    expect(s3Cmd.input.Bucket).toBe(BUCKET);
    expect(s3Cmd.input.ContentType).toBe('audio/mpeg');
    // Key format: ai-generations/{userId}/{fileId}.mp3
    expect(s3Cmd.input.Key).toMatch(new RegExp(`^ai-generations/${USER_ID}/[a-f0-9-]+\\.mp3$`));
  });

  it('calls filesRepo.createFile with kind=audio, mimeType=audio/mpeg, and correct storageUri', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    expect(m.filesRepoCreateFile).toHaveBeenCalledOnce();
    const [fileParams] = m.filesRepoCreateFile.mock.calls[0]!;
    const params = fileParams as Record<string, unknown>;

    expect(params['userId']).toBe(USER_ID);
    expect(params['kind']).toBe('audio');
    expect(params['mimeType']).toBe('audio/mpeg');
    expect(typeof params['bytes']).toBe('number');
    expect((params['bytes'] as number)).toBeGreaterThan(0);
    expect(params['storageUri']).toMatch(
      new RegExp(`^s3://${BUCKET}/ai-generations/${USER_ID}/[a-f0-9-]+\\.mp3$`),
    );
    expect((params['displayName'] as string)).toMatch(/^ai-text_to_speech-\d+\.mp3$/);
  });

  it('enqueues media-ingest job with correct payload structure', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    expect(m.ingestAdd).toHaveBeenCalledOnce();
    const [jobName, ingestPayload, opts] = m.ingestAdd.mock.calls[0]!;

    expect(jobName).toBe('ingest');
    expect((ingestPayload as Record<string, unknown>).contentType).toBe('audio/mpeg');
    expect((ingestPayload as Record<string, unknown>).fileId).toBeDefined();
    expect((ingestPayload as Record<string, unknown>).storageUri).toBeDefined();
    expect(typeof (opts as Record<string, unknown>).removeOnComplete).toBe('boolean');
  });

  it('calls setOutputFile with the jobId and the new fileId', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
    const [calledJobId, calledFileId] = m.aiGenerationJobRepoSetOutputFile.mock.calls[0]!;
    expect(calledJobId).toBe(JOB_ID);
    // fileId is a UUID — also used as the ingest jobId
    const [, ingestPayload] = m.ingestAdd.mock.calls[0]!;
    expect(calledFileId).toBe((ingestPayload as Record<string, unknown>).fileId);
  });
});

// ── music_generation ──────────────────────────────────────────────────────────

describe('processElevenLabsCapability / music_generation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates progress to 30 before calling musicGeneration', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({ capability: 'music_generation', options: { prompt: 'epic drums' } }),
      makeDeps(m),
    );

    const progressCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('SET progress = ?'),
    );
    expect(progressCall).toBeTruthy();
    expect(progressCall![1]).toEqual([30, JOB_ID]);
  });

  it('calls musicGeneration with a composition plan and no prompt', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({
        capability: 'music_generation',
        options: {
          composition_plan: COMPOSITION_PLAN,
          respect_sections_durations: false,
          model_id: 'music_v1',
        },
      }),
      makeDeps(m),
    );

    expect(m.musicGeneration).toHaveBeenCalledOnce();
    const [params] = m.musicGeneration.mock.calls[0]!;
    expect(params.prompt).toBeUndefined();
    expect(params.compositionPlan).toEqual(COMPOSITION_PLAN);
    expect(params.respectSectionsDurations).toBe(false);
    expect(params.modelId).toBe('music_v1');
    expect(params.apiKey).toBe('el-test-key');
  });

  // Review pass 14 (2): the canvas writes the seconds field ('duration'); the plan must
  // be created at duration*1000 ms AND the compose must respect the plan's section
  // durations BY DEFAULT (catalog default true) — without the fallback the field was
  // omitted (Inspector never prefills defaults) and ElevenLabs drifted from the
  // configured length.
  it('seconds field drives the plan length and respect_sections_durations defaults to true', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({
        capability: 'music_generation',
        options: { prompt: 'epic drums', duration: 60 },
      }),
      makeDeps(m),
    );

    expect(m.createMusicCompositionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ musicLengthMs: 60_000 }),
    );
    const [params] = m.musicGeneration.mock.calls[0]!;
    expect(params.respectSectionsDurations).toBe(true);
  });

  it('creates, stores, and composes from an instrumental plan for prompt-only fallback', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({
        capability: 'music_generation',
        options: { prompt: 'epic drums', music_length_ms: 45_000 },
      }),
      makeDeps(m),
    );

    expect(m.createMusicCompositionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'el-test-key',
        prompt: 'epic drums',
        musicLengthMs: 45_000,
      }),
    );

    const optionsUpdateCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('SET options = ?'),
    );
    expect(optionsUpdateCall).toBeTruthy();
    const storedOptions = JSON.parse(optionsUpdateCall![1][0] as string) as Record<string, unknown>;
    expect(storedOptions['composition_plan']).toBeDefined();
    expect(storedOptions['regenerate_composition_plan']).toBe(false);

    expect(m.musicGeneration).toHaveBeenCalledOnce();
    const [params] = m.musicGeneration.mock.calls[0]!;
    expect(params.prompt).toBeUndefined();
    expect(params.compositionPlan).toEqual(
      expect.objectContaining({
        negative_global_styles: expect.arrayContaining(['vocals', 'lyrics', 'singing']),
      }),
    );
    const plan = params.compositionPlan!;
    expect(plan.sections[0]!.lines).toEqual([]);
    expect(plan.sections[0]!.negative_local_styles).toEqual(
      expect.arrayContaining(['vocals', 'lyrics', 'singing']),
    );
  });

  it('regenerates a source composition plan from prompt before composing', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({
        capability: 'music_generation',
        options: {
          prompt: 'more urgent piano pulse',
          source_composition_plan: COMPOSITION_PLAN,
          music_length_ms: 30_000,
          regenerate_composition_plan: true,
        },
      }),
      makeDeps(m),
    );

    expect(m.createMusicCompositionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'more urgent piano pulse',
        sourceCompositionPlan: COMPOSITION_PLAN,
        musicLengthMs: 30_000,
      }),
    );
    expect(m.musicGeneration).toHaveBeenCalledOnce();
    const [params] = m.musicGeneration.mock.calls[0]!;
    expect(params.prompt).toBeUndefined();
    expect(params.compositionPlan).toBeDefined();
  });

  it('uploads audio with correct S3 key format and calls filesRepo.createFile', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({ capability: 'music_generation', options: { prompt: 'calm jazz' } }),
      makeDeps(m),
    );

    expect(m.s3Send).toHaveBeenCalledOnce();
    const s3Cmd = m.s3Send.mock.calls[0]![0] as { input: { Key: string; Bucket: string; ContentType: string } };
    expect(s3Cmd.input.Bucket).toBe(BUCKET);
    expect(s3Cmd.input.ContentType).toBe('audio/mpeg');
    expect(s3Cmd.input.Key).toMatch(new RegExp(`^ai-generations/${USER_ID}/[a-f0-9-]+\\.mp3$`));

    expect(m.filesRepoCreateFile).toHaveBeenCalledOnce();
    const [fileParams] = m.filesRepoCreateFile.mock.calls[0]!;
    const params = fileParams as Record<string, unknown>;
    expect(params['kind']).toBe('audio');
    expect(params['mimeType']).toBe('audio/mpeg');
    expect((params['displayName'] as string)).toMatch(/^ai-music_generation-\d+\.mp3$/);
  });

  it('enqueues ingest and calls setOutputFile with progress 100', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({ capability: 'music_generation', options: { prompt: 'calm jazz' } }),
      makeDeps(m),
    );

    expect(m.ingestAdd).toHaveBeenCalledOnce();
    const [jobName, payload] = m.ingestAdd.mock.calls[0]!;
    expect(jobName).toBe('ingest');
    expect((payload as Record<string, unknown>).contentType).toBe('audio/mpeg');

    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
    const [calledJobId, calledFileId] = m.aiGenerationJobRepoSetOutputFile.mock.calls[0]!;
    expect(calledJobId).toBe(JOB_ID);
    expect(calledFileId).toBeDefined();
  });
});
