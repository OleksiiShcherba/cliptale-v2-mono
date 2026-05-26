import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { type Connection, type RowDataPacket } from 'mysql2/promise';
import { createStoryboardMusicEndpointHarness } from './storyboard-music-endpoints.fixtures.js';

const { aiGenerateAddMock } = vi.hoisted(() => ({
  aiGenerateAddMock: vi.fn().mockResolvedValue({ id: 'queued-ai-generate' }),
}));

vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_AI_GENERATE: 'ai-generate',
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  aiGenerateQueue: { add: aiGenerateAddMock, getJob: vi.fn(), on: vi.fn() },
  mediaIngestQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  renderQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  transcriptionQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  storyboardPlanQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  storyboardOpenAIImageQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
}));

const fixture = createStoryboardMusicEndpointHarness(aiGenerateAddMock);
const auth = () => fixture.auth();
const sceneBlock = fixture.sceneBlock;
const musicBlock = fixture.musicBlock;
let app: Express;
let conn: Connection;
let draftId: string;
let audioFileId: string;
let imageFileId: string;
let userId: string;

beforeEach(async () => {
  app = fixture.app;
  conn = fixture.conn;
  draftId = fixture.draftId;
  audioFileId = fixture.audioFileId;
  imageFileId = fixture.imageFileId;
  userId = fixture.userId;
});

describe('storyboard music endpoints', () => {
  it('lists existing-track music as ready with its file id', async () => {
    const musicId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({ blocks: [sceneBlock()], edges: [], musicBlocks: [musicBlock(musicId, 'existing')] });

    const res = await request(app).get(`/storyboards/${draftId}/music`).set('Authorization', auth());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: musicId,
      generationStatus: 'ready',
      outputFileId: audioFileId,
    });
  });

  it('rejects non-audio existing files on music updates', async () => {
    const musicId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({ blocks: [sceneBlock()], edges: [], musicBlocks: [musicBlock(musicId, 'generate_now')] });

    const res = await request(app).patch(`/storyboards/${draftId}/music/${musicId}`)
      .set('Authorization', auth())
      .send({ sourceMode: 'existing', existingFileId: imageFileId });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('not a ready audio file');
  });

  it('starts one active generate-now job and does not duplicate it', async () => {
    const musicId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({ blocks: [sceneBlock()], edges: [], musicBlocks: [musicBlock(musicId, 'generate_now')] });

    const first = await request(app).post(`/storyboards/${draftId}/music/${musicId}/generate`)
      .set('Authorization', auth()).send({});
    const second = await request(app).post(`/storyboards/${draftId}/music/${musicId}/generate`)
      .set('Authorization', auth()).send({});

    expect(first.status, JSON.stringify(first.body)).toBe(202);
    expect(second.status, JSON.stringify(second.body)).toBe(202);
    expect(aiGenerateAddMock).toHaveBeenCalledTimes(1);
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_music_generation_jobs WHERE music_block_id = ?',
      [musicId],
    );
    expect(Number(rows[0]!['cnt'])).toBe(1);
  });

  it('refreshes a completed generated music output on list and links it to the draft', async () => {
    const musicId = randomUUID();
    const aiJobId = randomUUID();
    const mappingId = randomUUID();
    const outputFileId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({
        blocks: [sceneBlock()],
        edges: [],
        musicBlocks: [musicBlock(musicId, 'generate_on_step3')],
      });
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'audio', ?, 'audio/mpeg', 'generated-music.mp3', 'ready')`,
      [outputFileId, userId, `s3://test-bucket/${outputFileId}.mp3`],
    );
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, status, progress,
          output_file_id, draft_id)
       VALUES (?, ?, 'elevenlabs/music-generation', 'music_generation', 'music', '{}',
               'completed', 100, ?, ?)`,
      [aiJobId, userId, outputFileId, draftId],
    );
    await conn.execute(
      `INSERT INTO storyboard_music_generation_jobs
         (id, draft_id, music_block_id, ai_job_id, status, active_lock)
       VALUES (?, ?, ?, ?, 'queued', 1)`,
      [mappingId, draftId, musicId, aiJobId],
    );

    const res = await request(app).get(`/storyboards/${draftId}/music`).set('Authorization', auth());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: musicId,
      generationStatus: 'ready',
      outputFileId,
    });
    const [mappingRows] = await conn.execute<RowDataPacket[]>(
      `SELECT status, output_file_id, active_lock
         FROM storyboard_music_generation_jobs
        WHERE id = ?`,
      [mappingId],
    );
    expect(mappingRows[0]).toMatchObject({
      status: 'ready',
      output_file_id: outputFileId,
      active_lock: null,
    });
    const [draftFileRows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM draft_files WHERE draft_id = ? AND file_id = ?',
      [draftId, outputFileId],
    );
    expect(Number(draftFileRows[0]!['cnt'])).toBe(1);
  });

  it('retries a failed generate-now music block once and dedupes the active retry job', async () => {
    const musicId = randomUUID();
    const failedAiJobId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({ blocks: [sceneBlock()], edges: [], musicBlocks: [musicBlock(musicId, 'generate_now')] });
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, status, error_message, draft_id)
       VALUES (?, ?, 'elevenlabs/music-generation', 'music_generation', 'music', '{}',
               'failed', 'provider failed', ?)`,
      [failedAiJobId, userId, draftId],
    );
    await conn.execute(
      `INSERT INTO storyboard_music_generation_jobs
         (id, draft_id, music_block_id, ai_job_id, status, error_message, active_lock)
       VALUES (?, ?, ?, ?, 'failed', 'provider failed', NULL)`,
      [randomUUID(), draftId, musicId, failedAiJobId],
    );

    const first = await request(app).post(`/storyboards/${draftId}/music/${musicId}/generate`)
      .set('Authorization', auth()).send({});
    const second = await request(app).post(`/storyboards/${draftId}/music/${musicId}/generate`)
      .set('Authorization', auth()).send({});

    expect(first.status, JSON.stringify(first.body)).toBe(202);
    expect(second.status, JSON.stringify(second.body)).toBe(202);
    expect(aiGenerateAddMock).toHaveBeenCalledTimes(1);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total_cnt,
         SUM(status = 'queued' AND active_lock = 1) AS active_queued_cnt
       FROM storyboard_music_generation_jobs
       WHERE music_block_id = ?`,
      [musicId],
    );
    expect(Number(rows[0]!['total_cnt'])).toBe(2);
    expect(Number(rows[0]!['active_queued_cnt'])).toBe(1);
  });
});
