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
const foreignAuth = () => fixture.foreignAuth();
const sceneBlock = fixture.sceneBlock;
const musicBlock = fixture.musicBlock;
let app: Express;
let conn: Connection;
let draftId: string;
let audioFileId: string;
let foreignAudioFileId: string;
let userId: string;

beforeEach(async () => {
  app = fixture.app;
  conn = fixture.conn;
  draftId = fixture.draftId;
  audioFileId = fixture.audioFileId;
  foreignAudioFileId = fixture.foreignAudioFileId;
  userId = fixture.userId;
});

describe('storyboard music generate-pending and access endpoints', () => {
  it('starts only unresolved generate-on-step3 music through generate-pending', async () => {
    const pendingId = randomUUID();
    const existingId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth()).send({
      blocks: [sceneBlock()],
      edges: [],
      musicBlocks: [
        musicBlock(pendingId, 'generate_on_step3'),
        musicBlock(existingId, 'existing'),
      ],
    });

    const res = await request(app).post(`/storyboards/${draftId}/music/generate-pending`)
      .set('Authorization', auth()).send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(aiGenerateAddMock).toHaveBeenCalledTimes(1);
    expect(res.body.items.find((item: { id: string }) => item.id === pendingId)).toMatchObject({
      generationStatus: 'queued',
    });
    expect(res.body.items.find((item: { id: string }) => item.id === existingId)).toMatchObject({
      generationStatus: 'ready',
      outputFileId: audioFileId,
    });
  });

  it('fails not-started generate-now music fast for Step 3 without enqueueing it', async () => {
    const musicId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth()).send({
      blocks: [sceneBlock()],
      edges: [],
      musicBlocks: [musicBlock(musicId, 'generate_now')],
    });

    const res = await request(app).post(`/storyboards/${draftId}/music/generate-pending`)
      .set('Authorization', auth()).send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(aiGenerateAddMock).not.toHaveBeenCalled();
    expect(res.body.items[0]).toMatchObject({
      id: musicId,
      sourceMode: 'generate_now',
      generationStatus: 'failed',
      errorMessage: 'Generate this music block in Step 2 before starting Step 3.',
    });
  });

  it('keeps active generate-now music pollable during Step 3', async () => {
    const musicId = randomUUID();
    const aiJobId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth()).send({
      blocks: [sceneBlock()],
      edges: [],
      musicBlocks: [musicBlock(musicId, 'generate_now')],
    });
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, status, progress, draft_id)
       VALUES (?, ?, 'elevenlabs/music-generation', 'music_generation', 'music', '{}',
               'queued', 0, ?)`,
      [aiJobId, userId, draftId],
    );
    await conn.execute(
      `INSERT INTO storyboard_music_generation_jobs
         (id, draft_id, music_block_id, ai_job_id, status, active_lock)
       VALUES (?, ?, ?, ?, 'queued', 1)`,
      [randomUUID(), draftId, musicId, aiJobId],
    );

    const res = await request(app).post(`/storyboards/${draftId}/music/generate-pending`)
      .set('Authorization', auth()).send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(aiGenerateAddMock).not.toHaveBeenCalled();
    expect(res.body.items[0]).toMatchObject({
      id: musicId,
      sourceMode: 'generate_now',
      generationStatus: 'queued',
      generationJobId: aiJobId,
    });
  });

  it('starts only unresolved generate-on-step3 blocks across null, active, ready, and failed states', async () => {
    const nullId = randomUUID();
    const queuedId = randomUUID();
    const runningId = randomUUID();
    const readyId = randomUUID();
    const failedId = randomUUID();
    const readyOutputFileId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth()).send({
      blocks: [sceneBlock()],
      edges: [],
      musicBlocks: [
        musicBlock(nullId, 'generate_on_step3'),
        musicBlock(queuedId, 'generate_on_step3'),
        musicBlock(runningId, 'generate_on_step3'),
        musicBlock(readyId, 'generate_on_step3'),
        musicBlock(failedId, 'generate_on_step3'),
      ],
    });
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'audio', ?, 'audio/mpeg', 'ready-generated.mp3', 'ready')`,
      [readyOutputFileId, userId, `s3://test-bucket/${readyOutputFileId}.mp3`],
    );
    const seededJobs = [
      { blockId: queuedId, aiJobId: randomUUID(), aiStatus: 'queued', musicStatus: 'queued', output: null, active: 1 },
      { blockId: runningId, aiJobId: randomUUID(), aiStatus: 'processing', musicStatus: 'running', output: null, active: 1 },
      { blockId: readyId, aiJobId: randomUUID(), aiStatus: 'completed', musicStatus: 'ready', output: readyOutputFileId, active: null },
      { blockId: failedId, aiJobId: randomUUID(), aiStatus: 'failed', musicStatus: 'failed', output: null, active: null },
    ] as const;
    for (const job of seededJobs) {
      await conn.execute(
        `INSERT INTO ai_generation_jobs
           (job_id, user_id, model_id, capability, prompt, options, status, progress,
            output_file_id, draft_id)
         VALUES (?, ?, 'elevenlabs/music-generation', 'music_generation', 'music', '{}',
                 ?, ?, ?, ?)`,
        [
          job.aiJobId,
          userId,
          job.aiStatus,
          job.aiStatus === 'completed' ? 100 : 0,
          job.output,
          draftId,
        ],
      );
      await conn.execute(
        `INSERT INTO storyboard_music_generation_jobs
           (id, draft_id, music_block_id, ai_job_id, status, output_file_id, active_lock)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), draftId, job.blockId, job.aiJobId, job.musicStatus, job.output, job.active],
      );
    }

    const first = await request(app).post(`/storyboards/${draftId}/music/generate-pending`)
      .set('Authorization', auth()).send({});
    const second = await request(app).post(`/storyboards/${draftId}/music/generate-pending`)
      .set('Authorization', auth()).send({});

    expect(first.status, JSON.stringify(first.body)).toBe(202);
    expect(second.status, JSON.stringify(second.body)).toBe(202);
    expect(aiGenerateAddMock).toHaveBeenCalledTimes(2);
    const byId = new Map(first.body.items.map((item: { id: string }) => [item.id, item]));
    expect(byId.get(nullId)).toMatchObject({ generationStatus: 'queued' });
    expect(byId.get(queuedId)).toMatchObject({ generationStatus: 'queued' });
    expect(byId.get(runningId)).toMatchObject({ generationStatus: 'running' });
    expect(byId.get(readyId)).toMatchObject({
      generationStatus: 'ready',
      outputFileId: readyOutputFileId,
    });
    expect(byId.get(failedId)).toMatchObject({ generationStatus: 'queued' });
    const [activeRows] = await conn.execute<RowDataPacket[]>(
      `SELECT music_block_id, COUNT(*) AS cnt
         FROM storyboard_music_generation_jobs
        WHERE draft_id = ?
          AND active_lock = 1
          AND status IN ('queued', 'running')
        GROUP BY music_block_id`,
      [draftId],
    );
    const activeByBlock = new Map(activeRows.map((row) => [row['music_block_id'], Number(row['cnt'])]));
    expect(activeByBlock.get(nullId)).toBe(1);
    expect(activeByBlock.get(queuedId)).toBe(1);
    expect(activeByBlock.get(runningId)).toBe(1);
    expect(activeByBlock.get(failedId)).toBe(1);
    expect(activeByBlock.has(readyId)).toBe(false);
  });

  it('rejects foreign draft access on music list, update, and generation routes', async () => {
    const musicId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({ blocks: [sceneBlock()], edges: [], musicBlocks: [musicBlock(musicId, 'generate_now')] });

    const list = await request(app).get(`/storyboards/${draftId}/music`)
      .set('Authorization', foreignAuth());
    const update = await request(app).patch(`/storyboards/${draftId}/music/${musicId}`)
      .set('Authorization', foreignAuth())
      .send({ name: 'No access' });
    const generate = await request(app).post(`/storyboards/${draftId}/music/${musicId}/generate`)
      .set('Authorization', foreignAuth())
      .send({});
    const pending = await request(app).post(`/storyboards/${draftId}/music/generate-pending`)
      .set('Authorization', foreignAuth())
      .send({});

    expect(list.status).toBe(403);
    expect(update.status).toBe(403);
    expect(generate.status).toBe(403);
    expect(pending.status).toBe(403);
  });

  it('rejects existing audio files owned by another user on music updates', async () => {
    const musicId = randomUUID();
    await request(app).put(`/storyboards/${draftId}`).set('Authorization', auth())
      .send({ blocks: [sceneBlock()], edges: [], musicBlocks: [musicBlock(musicId, 'generate_now')] });

    const res = await request(app).patch(`/storyboards/${draftId}/music/${musicId}`)
      .set('Authorization', auth())
      .send({ sourceMode: 'existing', existingFileId: foreignAudioFileId });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('not a ready audio file');
  });
});
