import { vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';
import type { Queue } from 'bullmq';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import type {
  AudioHandlerDeps,
  AudioJobData,
} from './ai-generate-audio.handler.js';
import type { CreateFileParams } from './ai-generate.job.js';

export const BUCKET = 'test-bucket';
export const JOB_ID = 'job-1';
export const USER_ID = 'user-1';
export const PROJECT_ID = 'proj-1';
export const AUDIO_BYTES = Buffer.from([0x49, 0x44, 0x33]); // fake mp3 bytes

export function makeMocks() {
  const execute = vi.fn().mockResolvedValue([]);
  const pool = { execute } as unknown as Pool;

  const s3Send = vi.fn().mockResolvedValue({});
  const s3 = { send: s3Send } as unknown as S3Client;

  const ingestAdd = vi.fn().mockResolvedValue({ id: 'ingest-1' });
  const ingestQueue = { add: ingestAdd } as unknown as Queue<MediaIngestJobPayload>;

  const textToSpeech = vi.fn().mockResolvedValue(AUDIO_BYTES);
  const voiceClone = vi.fn().mockResolvedValue({ voiceId: 'el-voice-abc' });
  const speechToSpeech = vi.fn().mockResolvedValue(AUDIO_BYTES);
  const musicGeneration = vi.fn().mockResolvedValue(AUDIO_BYTES);

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => AUDIO_BYTES.buffer,
  });

  // filesRepo.createFile resolves with the fileId that was passed in
  const filesRepoCreateFile = vi.fn().mockImplementation(
    async (params: CreateFileParams) => params.fileId,
  );
  const aiGenerationJobRepoSetOutputFile = vi.fn().mockResolvedValue(undefined);

  return {
    pool,
    execute,
    s3,
    s3Send,
    ingestQueue,
    ingestAdd,
    textToSpeech,
    voiceClone,
    speechToSpeech,
    musicGeneration,
    fetchMock,
    filesRepoCreateFile,
    aiGenerationJobRepoSetOutputFile,
  };
}

export function makeDeps(m: ReturnType<typeof makeMocks>): AudioHandlerDeps {
  return {
    s3: m.s3,
    pool: m.pool,
    bucket: BUCKET,
    elevenlabsKey: 'el-test-key',
    elevenlabs: {
      textToSpeech: m.textToSpeech as unknown as AudioHandlerDeps['elevenlabs']['textToSpeech'],
      voiceClone: m.voiceClone as unknown as AudioHandlerDeps['elevenlabs']['voiceClone'],
      speechToSpeech: m.speechToSpeech as unknown as AudioHandlerDeps['elevenlabs']['speechToSpeech'],
      musicGeneration: m.musicGeneration as unknown as AudioHandlerDeps['elevenlabs']['musicGeneration'],
    },
    ingestQueue: m.ingestQueue,
    filesRepo: {
      createFile: m.filesRepoCreateFile as unknown as AudioHandlerDeps['filesRepo']['createFile'],
    },
    aiGenerationJobRepo: {
      setOutputFile: m.aiGenerationJobRepoSetOutputFile as unknown as AudioHandlerDeps['aiGenerationJobRepo']['setOutputFile'],
    },
  };
}

export function makeData(overrides: Partial<AudioJobData> = {}): AudioJobData {
  return {
    jobId: JOB_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    capability: 'text_to_speech',
    options: { text: 'Hello world' },
    ...overrides,
  };
}
