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

// ── voice_cloning ─────────────────────────────────────────────────────────────

describe('processElevenLabsCapability / voice_cloning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => AUDIO_BYTES.buffer,
    }));
  });

  it('downloads the audio sample then calls voiceClone with name and bytes', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    const data = makeData({
      capability: 'voice_cloning',
      options: { name: 'My Voice', audio_sample: 'https://s3.example.com/sample.mp3', description: 'desc' },
    });

    await processElevenLabsCapability(data, makeDeps(m));

    expect(m.fetchMock).toHaveBeenCalledOnce();
    expect(m.voiceClone).toHaveBeenCalledOnce();
    const [cloneParams] = m.voiceClone.mock.calls[0]!;
    expect(cloneParams.name).toBe('My Voice');
    expect(cloneParams.description).toBe('desc');
    expect(Buffer.isBuffer(cloneParams.audioSampleBytes)).toBe(true);
  });

  it('stores the voiceId as elevenlabs://voice/{id} in result_url (no S3 upload)', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    const data = makeData({
      capability: 'voice_cloning',
      options: { name: 'X', audio_sample: 'https://s3.example.com/s.mp3' },
    });

    await processElevenLabsCapability(data, makeDeps(m));

    // No S3 upload for voice cloning
    expect(m.s3Send).not.toHaveBeenCalled();

    // No asset row inserted for voice cloning
    const assetInsert = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(assetInsert).toBeFalsy();

    const completedCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'completed'"),
    );
    expect(completedCall).toBeTruthy();
    const params = completedCall![1] as string[];
    expect(params[0]).toBe('elevenlabs://voice/el-voice-abc');
  });

  it('inserts a user_voices row with voiceId, userId, label, and elevenLabsVoiceId', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    const data = makeData({
      capability: 'voice_cloning',
      options: { name: 'My Clone', audio_sample: 'https://s3.example.com/s.mp3' },
    });

    await processElevenLabsCapability(data, makeDeps(m));

    const insertCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO user_voices'),
    );
    expect(insertCall).toBeTruthy();
    const [, values] = insertCall!;
    const [voiceId, userId, label, elevenLabsVoiceId] = values as string[];

    expect(typeof voiceId).toBe('string');
    expect(voiceId.length).toBeGreaterThan(0);
    expect(userId).toBe(USER_ID);
    expect(label).toBe('My Clone');
    expect(elevenLabsVoiceId).toBe('el-voice-abc');
  });

  it('sets progress to 30 and completion to 100 for voice cloning', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    const data = makeData({
      capability: 'voice_cloning',
      options: { name: 'My Voice', audio_sample: 'https://s3.example.com/sample.mp3' },
    });

    await processElevenLabsCapability(data, makeDeps(m));

    const progressCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE ai_generation_jobs') && c[1][0] === 30,
    );
    expect(progressCall).toBeTruthy();

    const completedCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("progress = 100") && c[0].includes("status = 'completed'"),
    );
    expect(completedCall).toBeTruthy();
  });
});

// ── speech_to_speech ──────────────────────────────────────────────────────────

describe('processElevenLabsCapability / speech_to_speech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates progress to 30 before processing', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    const data = makeData({
      capability: 'speech_to_speech',
      options: { source_audio: 'https://s3.example.com/src.mp3', voice_id: 'v' },
    });

    await processElevenLabsCapability(data, makeDeps(m));

    const progressCall = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('SET progress = ?'),
    );
    expect(progressCall).toBeTruthy();
    expect(progressCall![1]).toEqual([30, JOB_ID]);
  });

  it('downloads source audio then calls speechToSpeech with voiceId and bytes', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    const data = makeData({
      capability: 'speech_to_speech',
      options: { source_audio: 'https://s3.example.com/src.mp3', voice_id: 'target-voice', stability: 0.7 },
    });

    await processElevenLabsCapability(data, makeDeps(m));

    expect(m.fetchMock).toHaveBeenCalledOnce();
    expect(m.speechToSpeech).toHaveBeenCalledOnce();
    const [s2sParams] = m.speechToSpeech.mock.calls[0]!;
    expect(s2sParams.voiceId).toBe('target-voice');
    expect(s2sParams.stability).toBe(0.7);
    expect(Buffer.isBuffer(s2sParams.sourceAudioBytes)).toBe(true);
  });

  it('uploads the output audio with correct S3 key format', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    await processElevenLabsCapability(
      makeData({ capability: 'speech_to_speech', options: { source_audio: 'https://s3.example.com/src.mp3', voice_id: 'v' } }),
      makeDeps(m),
    );

    expect(m.s3Send).toHaveBeenCalledOnce();
    const s3Cmd = m.s3Send.mock.calls[0]![0] as { input: { Key: string } };
    expect(s3Cmd.input.Key).toMatch(new RegExp(`^ai-generations/${PROJECT_ID}/[a-f0-9-]+\\.mp3$`));
  });

  it('inserts asset row and enqueues ingest after upload', async () => {
    const m = makeMocks();
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    await processElevenLabsCapability(
      makeData({ capability: 'speech_to_speech', options: { source_audio: 'https://s3.example.com/src.mp3', voice_id: 'v' } }),
      makeDeps(m),
    );

    const assetInsert = m.execute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(assetInsert).toBeTruthy();

    expect(m.ingestAdd).toHaveBeenCalledOnce();
    const [jobName, payload] = m.ingestAdd.mock.calls[0]!;
    expect(jobName).toBe('ingest');
    expect((payload as Record<string, unknown>).contentType).toBe('audio/mpeg');
  });
});
