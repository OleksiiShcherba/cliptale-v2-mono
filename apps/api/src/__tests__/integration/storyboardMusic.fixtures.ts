import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll } from 'vitest';
import type { Express } from 'express';
import mysql, { type Connection } from 'mysql2/promise';

type SceneBlockType = 'scene' | 'start' | 'end';

type SceneBlockOptions = {
  blockType?: SceneBlockType;
  name?: string | null;
  prompt?: string | null;
};

type PersistenceHarnessState = {
  app?: Express;
  conn?: Connection;
  draftId?: string;
  audioFileId?: string;
  imageFileId?: string;
  pendingAudioFileId?: string;
  foreignAudioFileId?: string;
};

export type StoryboardMusicPersistenceHarness = {
  readonly app: Express;
  readonly conn: Connection;
  readonly draftId: string;
  readonly audioFileId: string;
  readonly imageFileId: string;
  readonly pendingAudioFileId: string;
  readonly foreignAudioFileId: string;
  readonly userId: string;
  auth(): string;
  sceneBlock(id: string, sortOrder: number, options?: SceneBlockOptions): ReturnType<typeof baseSceneBlock>;
  musicBlock(id: string, startSceneId: string, endSceneId: string): ReturnType<typeof baseMusicBlock>;
};

const USER_ID = `sbm-${randomUUID().slice(0, 8)}`;
const FOREIGN_USER_ID = `sbm-foreign-${randomUUID().slice(0, 8)}`;
const SESSION_ID = randomUUID();
const TOKEN = `tok-sbm-${randomUUID()}`;

function auth(): string {
  return `Bearer ${TOKEN}`;
}

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ensure<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Storyboard music persistence fixture ${name} is not initialized`);
  }
  return value;
}

function baseSceneBlock(
  draftId: string,
  id: string,
  sortOrder: number,
  options: SceneBlockOptions = {},
) {
  return {
    id,
    draftId,
    blockType: options.blockType ?? 'scene',
    name: options.name ?? `Scene ${sortOrder}`,
    prompt: options.prompt ?? `Scene ${sortOrder} prompt`,
    videoPrompt: null,
    durationS: 6,
    positionX: 100 + sortOrder * 200,
    positionY: 250,
    sortOrder,
    style: null,
    mediaItems: [],
  };
}

function baseMusicBlock(
  draftId: string,
  audioFileId: string,
  id: string,
  startSceneId: string,
  endSceneId: string,
) {
  return {
    id,
    draftId,
    name: 'Opening music',
    sourceMode: 'existing',
    prompt: null,
    compositionPlan: null,
    existingFileId: audioFileId,
    startSceneBlockId: startSceneId,
    endSceneBlockId: endSceneId,
    positionX: 160,
    positionY: 520,
    sortOrder: 0,
    volume: 0.75,
    fadeInS: 0.5,
    fadeOutS: 1,
    loopMode: 'trim',
  };
}

export function createStoryboardMusicPersistenceHarness(): StoryboardMusicPersistenceHarness {
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
    APP_JWT_SECRET: 'storyboard-music-int-test-secret-32ch',
    APP_DEV_AUTH_BYPASS: 'false',
  });

  const state: PersistenceHarnessState = {};

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
    state.pendingAudioFileId = randomUUID();
    state.foreignAudioFileId = randomUUID();
    await state.conn.execute(
      'INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)',
      [USER_ID, `${USER_ID}@test.com`, USER_ID],
    );
    await state.conn.execute(
      'INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)',
      [FOREIGN_USER_ID, `${FOREIGN_USER_ID}@test.com`, FOREIGN_USER_ID],
    );
    await state.conn.execute(
      'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [SESSION_ID, USER_ID, sha256(TOKEN), new Date(Date.now() + 3_600_000)],
    );
    await state.conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [state.draftId, USER_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
    await state.conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'audio', ?, 'audio/mpeg', 'music.mp3', 'ready'),
              (?, ?, 'image', ?, 'image/png', 'image.png', 'ready'),
              (?, ?, 'audio', ?, 'audio/mpeg', 'pending.mp3', 'pending'),
              (?, ?, 'audio', ?, 'audio/mpeg', 'foreign.mp3', 'ready')`,
      [
        state.audioFileId, USER_ID, `s3://test-bucket/${state.audioFileId}.mp3`,
        state.imageFileId, USER_ID, `s3://test-bucket/${state.imageFileId}.png`,
        state.pendingAudioFileId, USER_ID, `s3://test-bucket/${state.pendingAudioFileId}.mp3`,
        state.foreignAudioFileId, FOREIGN_USER_ID,
        `s3://test-bucket/${state.foreignAudioFileId}.mp3`,
      ],
    );
  });

  afterAll(async () => {
    if (!state.conn) return;
    const draftId = ensure(state.draftId, 'draftId');
    await state.conn.execute('DELETE FROM generation_drafts WHERE id = ?', [draftId]);
    await state.conn.execute('DELETE FROM files WHERE file_id IN (?, ?, ?, ?)', [
      ensure(state.audioFileId, 'audioFileId'),
      ensure(state.imageFileId, 'imageFileId'),
      ensure(state.pendingAudioFileId, 'pendingAudioFileId'),
      ensure(state.foreignAudioFileId, 'foreignAudioFileId'),
    ]);
    await state.conn.execute('DELETE FROM sessions WHERE session_id = ?', [SESSION_ID]);
    await state.conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [
      USER_ID,
      FOREIGN_USER_ID,
    ]);
    await state.conn.end();
  });

  return {
    get app() { return ensure(state.app, 'app'); },
    get conn() { return ensure(state.conn, 'connection'); },
    get draftId() { return ensure(state.draftId, 'draftId'); },
    get audioFileId() { return ensure(state.audioFileId, 'audioFileId'); },
    get imageFileId() { return ensure(state.imageFileId, 'imageFileId'); },
    get pendingAudioFileId() { return ensure(state.pendingAudioFileId, 'pendingAudioFileId'); },
    get foreignAudioFileId() { return ensure(state.foreignAudioFileId, 'foreignAudioFileId'); },
    get userId() { return USER_ID; },
    auth,
    sceneBlock: (id, sortOrder, options) => (
      baseSceneBlock(ensure(state.draftId, 'draftId'), id, sortOrder, options)
    ),
    musicBlock: (id, startSceneId, endSceneId) => (
      baseMusicBlock(
        ensure(state.draftId, 'draftId'),
        ensure(state.audioFileId, 'audioFileId'),
        id,
        startSceneId,
        endSceneId,
      )
    ),
  };
}
