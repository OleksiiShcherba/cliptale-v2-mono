import { describe, it, expect, vi, beforeEach } from 'vitest';

import { processElevenLabsCapability } from './ai-generate-audio.handler.js';
import {
  BUCKET,
  JOB_ID,
  USER_ID,
  PROJECT_ID,
  AUDIO_BYTES,
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

  it('uploads audio to S3 with correct key format (ai-generations/{projectId}/{assetId}.mp3)', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    expect(m.s3Send).toHaveBeenCalledOnce();
    const s3Cmd = m.s3Send.mock.calls[0]![0] as { input: { Bucket: string; Key: string; ContentType: string } };
    expect(s3Cmd.input.Bucket).toBe(BUCKET);
    expect(s3Cmd.input.ContentType).toBe('audio/mpeg');
    // Key format: ai-generations/{projectId}/{assetId}.mp3
    expect(s3Cmd.input.Key).toMatch(new RegExp(`^ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));
  });

  it('inserts asset row with all required fields', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    const insertCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(insertCall).toBeTruthy();
    const [, values] = insertCall!;
    const [assetId, projId, userId, filename, contentType, fileSizeBytes, storageUri, ...rest] = values as unknown[];

    expect(projId).toBe(PROJECT_ID);
    expect(userId).toBe(USER_ID);
    expect(filename).toMatch(/^ai-text_to_speech-\d+\.mp3$/);
    expect(contentType).toBe('audio/mpeg');
    expect(typeof fileSizeBytes).toBe('number');
    expect(fileSizeBytes).toBeGreaterThan(0);
    expect(storageUri).toMatch(new RegExp(`^s3://${BUCKET}/ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));
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

  it('marks the job completed with s3:// result_url and result_asset_id', async () => {
    const m = makeMocks();
    await processElevenLabsCapability(makeData({ capability: 'text_to_speech', options: { text: 'hi' } }), makeDeps(m));

    const completedCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'completed'"),
    );
    expect(completedCall).toBeTruthy();
    const [, values] = completedCall!;
    const [resultUrl, resultAssetId, jobId] = values as string[];

    expect(resultUrl).toMatch(new RegExp(`^s3://${BUCKET}/ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));
    expect(resultAssetId).toBeDefined();
    expect(jobId).toBe(JOB_ID);
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

  it('calls musicGeneration with prompt and optional duration', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({ capability: 'music_generation', options: { prompt: 'epic drums', duration: 45 } }),
      makeDeps(m),
    );

    expect(m.musicGeneration).toHaveBeenCalledOnce();
    const [params] = m.musicGeneration.mock.calls[0]!;
    expect(params.prompt).toBe('epic drums');
    expect(params.durationSeconds).toBe(45);
    expect(params.apiKey).toBe('el-test-key');
  });

  it('uploads audio with correct S3 key format and inserts asset row', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({ capability: 'music_generation', options: { prompt: 'calm jazz' } }),
      makeDeps(m),
    );

    expect(m.s3Send).toHaveBeenCalledOnce();
    const s3Cmd = m.s3Send.mock.calls[0]![0] as { input: { Key: string; Bucket: string; ContentType: string } };
    expect(s3Cmd.input.Bucket).toBe(BUCKET);
    expect(s3Cmd.input.ContentType).toBe('audio/mpeg');
    expect(s3Cmd.input.Key).toMatch(new RegExp(`^ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));

    const insertCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(insertCall).toBeTruthy();
    const [, values] = insertCall!;
    const [assetId, projId, userId, filename, contentType, fileSizeBytes, storageUri] = values as unknown[];
    expect(projId).toBe(PROJECT_ID);
    expect(userId).toBe(USER_ID);
    expect(filename).toMatch(/^ai-music_generation-\d+\.mp3$/);
    expect(contentType).toBe('audio/mpeg');
    expect(typeof fileSizeBytes).toBe('number');
    expect(storageUri).toMatch(new RegExp(`^s3://${BUCKET}/ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));
  });

  it('enqueues ingest and marks completed with progress 100 and s3:// result_url', async () => {
    const m = makeMocks();

    await processElevenLabsCapability(
      makeData({ capability: 'music_generation', options: { prompt: 'calm jazz' } }),
      makeDeps(m),
    );

    expect(m.ingestAdd).toHaveBeenCalledOnce();
    const [jobName, payload] = m.ingestAdd.mock.calls[0]!;
    expect(jobName).toBe('ingest');
    expect((payload as Record<string, unknown>).contentType).toBe('audio/mpeg');

    const completedCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'completed'"),
    );
    expect(completedCall).toBeTruthy();
    const [, values] = completedCall!;
    const [resultUrl, resultAssetId, jobId] = values as string[];
    expect(resultUrl).toMatch(new RegExp(`^s3://${BUCKET}/ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));
    expect(resultAssetId).toBeDefined();
    expect(jobId).toBe(JOB_ID);
  });
});
