import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, type Mock } from 'vitest';
import type { Express } from 'express';
import mysql, { type Connection } from 'mysql2/promise';

type MusicSourceMode = 'existing' | 'generate_now' | 'generate_on_step3';

type EndpointHarnessState = {
  app?: Express;
  conn?: Connection;
  draftId?: string;
  audioFileId?: string;
  imageFileId?: string;
  foreignAudioFileId?: string;
  sceneId?: string;
};

export type StoryboardMusicEndpointHarness = {
  readonly app: Express;
  readonly conn: Connection;
  readonly draftId: string;
  readonly audioFileId: string;
  readonly imageFileId: string;
  readonly foreignAudioFileId: string;
  readonly sceneId: string;
  readonly userId: string;
  auth(): string;
  foreignAuth(): string;
  sceneBlock(id?: string): ReturnType<typeof baseSceneBlock>;
  musicBlock(id: string, sourceMode: MusicSourceMode): ReturnType<typeof baseMusicBlock>;
};

const plan = {
  positive_global_styles: ['cinematic', 'instrumental'],
  negative_global_styles: ['vocals', 'lyrics'],
  sections: [{
    section_name: 'Main',
    positive_local_styles: ['warm pulse'],
    negative_local_styles: [],
    duration_ms: 12_000,
    lines: [],
  }],
};

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ensure<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Storyboard music endpoint fixture ${name} is not initialized`);
  }
  return value;
}

function baseSceneBlock(draftId: string, sceneId: string, id = sceneId) {
  return {
    id,
    draftId,
    blockType: 'scene',
    name: 'Scene',
    prompt: 'Scene prompt',
    videoPrompt: null,
    durationS: 6,
    positionX: 100,
    positionY: 250,
    sortOrder: 1,
    style: null,
    mediaItems: [],
  };
}

function baseMusicBlock(
  draftId: string,
  audioFileId: string,
  sceneId: string,
  id: string,
  sourceMode: MusicSourceMode,
) {
  return {
    id,
    draftId,
    name: 'Music',
    sourceMode,
    prompt: sourceMode === 'existing' ? null : 'Warm instrumental pulse',
    compositionPlan: sourceMode === 'existing' ? null : plan,
    existingFileId: sourceMode === 'existing' ? audioFileId : null,
    startSceneBlockId: sceneId,
    endSceneBlockId: sceneId,
    positionX: 160,
    positionY: 520,
    sortOrder: 0,
    volume: 0.75,
    fadeInS: 0.5,
    fadeOutS: 1,
    loopMode: 'trim',
  };
}

export function createStoryboardMusicEndpointHarness(
  aiGenerateAddMock: Mock,
): StoryboardMusicEndpointHarness {
  Object.assign(process.env, {
    APP_DB_HOST: process.env['APP_DB_HOST'] ?? 'localhost',
    APP_DB_PORT: process.env['APP_DB_PORT'] ?? '3306',
    APP_DB_NAME: process.env['APP_DB_NAME'] ?? 'cliptale',
    APP_DB_USER: process.env['APP_DB_USER'] ?? 'cliptale',
    APP_DB_PASSWORD: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    APP_REDIS_URL: process.env['APP_REDIS_URL'] ?? 'redis://localhost:6379',
    APP_S3_BUCKET: process.env['APP_S3_BUCKET'] ?? 'test-bucket',
    APP_S3_REGION: process.env['APP_S3_REGION'] ?? 'us-east-1',
    APP_S3_ACCESS_KEY_ID: 'test-access-key-id',
    APP_S3_SECRET_ACCESS_KEY: 'test-secret-key-value',
    APP_JWT_SECRET: 'storyboard-music-endpoints-secret-32',
    APP_DEV_AUTH_BYPASS: 'false',
  });

  const userId = `sbme-${randomUUID().slice(0, 8)}`;
  const foreignUserId = `sbme-foreign-${randomUUID().slice(0, 8)}`;
  const sessionId = randomUUID();
  const token = `tok-sbme-${randomUUID()}`;
  const foreignSessionId = randomUUID();
  const foreignToken = `tok-sbme-foreign-${randomUUID()}`;
  const state: EndpointHarnessState = {};

  beforeAll(async () => {
    const mod = await import('../../index.js');
    state.app = mod.default;
    state.conn = await mysql.createConnection({
      host: process.env['APP_DB_HOST'],
      port: Number(process.env['APP_DB_PORT']),
      database: process.env['APP_DB_NAME'],
      user: process.env['APP_DB_USER'],
      password: process.env['APP_DB_PASSWORD'],
    });

    state.draftId = randomUUID();
    state.audioFileId = randomUUID();
    state.imageFileId = randomUUID();
    state.foreignAudioFileId = randomUUID();
    state.sceneId = randomUUID();
    await state.conn.execute(
      'INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)',
      [userId, `${userId}@test.com`, userId],
    );
    await state.conn.execute(
      'INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)',
      [foreignUserId, `${foreignUserId}@test.com`, foreignUserId],
    );
    await state.conn.execute(
      'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, userId, sha256(token), new Date(Date.now() + 3_600_000)],
    );
    await state.conn.execute(
      'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [
        foreignSessionId,
        foreignUserId,
        sha256(foreignToken),
        new Date(Date.now() + 3_600_000),
      ],
    );
    await state.conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [state.draftId, userId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
    await state.conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'audio', ?, 'audio/mpeg', 'music.mp3', 'ready'),
              (?, ?, 'image', ?, 'image/png', 'image.png', 'ready'),
              (?, ?, 'audio', ?, 'audio/mpeg', 'foreign.mp3', 'ready')`,
      [
        state.audioFileId, userId, `s3://test-bucket/${state.audioFileId}.mp3`,
        state.imageFileId, userId, `s3://test-bucket/${state.imageFileId}.png`,
        state.foreignAudioFileId, foreignUserId,
        `s3://test-bucket/${state.foreignAudioFileId}.mp3`,
      ],
    );
  });

  beforeEach(async () => {
    aiGenerateAddMock.mockClear();
    const conn = ensure(state.conn, 'connection');
    const draftId = ensure(state.draftId, 'draftId');
    await conn.execute('DELETE FROM draft_files WHERE draft_id = ?', [draftId]);
    await conn.execute(
      'DELETE FROM storyboard_music_generation_jobs WHERE draft_id = ?',
      [draftId],
    );
    await conn.execute('DELETE FROM ai_generation_jobs WHERE user_id = ?', [userId]);
  });

  afterAll(async () => {
    if (!state.conn) return;
    const draftId = ensure(state.draftId, 'draftId');
    await state.conn.execute('DELETE FROM draft_files WHERE draft_id = ?', [draftId]);
    await state.conn.execute('DELETE FROM generation_drafts WHERE id = ?', [draftId]);
    await state.conn.execute('DELETE FROM ai_generation_jobs WHERE user_id = ?', [userId]);
    await state.conn.execute('DELETE FROM files WHERE user_id IN (?, ?)', [userId, foreignUserId]);
    await state.conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [
      sessionId,
      foreignSessionId,
    ]);
    await state.conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [userId, foreignUserId]);
    await state.conn.end();
  });

  return {
    get app() { return ensure(state.app, 'app'); },
    get conn() { return ensure(state.conn, 'connection'); },
    get draftId() { return ensure(state.draftId, 'draftId'); },
    get audioFileId() { return ensure(state.audioFileId, 'audioFileId'); },
    get imageFileId() { return ensure(state.imageFileId, 'imageFileId'); },
    get foreignAudioFileId() { return ensure(state.foreignAudioFileId, 'foreignAudioFileId'); },
    get sceneId() { return ensure(state.sceneId, 'sceneId'); },
    get userId() { return userId; },
    auth: () => `Bearer ${token}`,
    foreignAuth: () => `Bearer ${foreignToken}`,
    sceneBlock: (id) => (
      baseSceneBlock(ensure(state.draftId, 'draftId'), ensure(state.sceneId, 'sceneId'), id)
    ),
    musicBlock: (id, sourceMode) => (
      baseMusicBlock(
        ensure(state.draftId, 'draftId'),
        ensure(state.audioFileId, 'audioFileId'),
        ensure(state.sceneId, 'sceneId'),
        id,
        sourceMode,
      )
    ),
  };
}
