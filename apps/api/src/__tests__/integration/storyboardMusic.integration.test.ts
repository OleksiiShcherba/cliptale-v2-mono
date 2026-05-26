import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { type Connection, type RowDataPacket } from 'mysql2/promise';
import { createStoryboardMusicPersistenceHarness } from './storyboardMusic.fixtures.js';

vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  mediaIngestQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  renderQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  transcriptionQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  storyboardPlanQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({ s3Client: { send: vi.fn().mockResolvedValue({}) } }));

const fixture = createStoryboardMusicPersistenceHarness();
const auth = () => fixture.auth();
const sceneBlock = fixture.sceneBlock;
const musicBlock = fixture.musicBlock;
let app: Express;
let conn: Connection;
let draftId: string;
let audioFileId: string;
let imageFileId: string;
let pendingAudioFileId: string;
let foreignAudioFileId: string;
let userId: string;

beforeEach(() => {
  app = fixture.app;
  conn = fixture.conn;
  draftId = fixture.draftId;
  audioFileId = fixture.audioFileId;
  imageFileId = fixture.imageFileId;
  pendingAudioFileId = fixture.pendingAudioFileId;
  foreignAudioFileId = fixture.foreignAudioFileId;
  userId = fixture.userId;
});

describe('storyboard music persistence', () => {
  it('round-trips music blocks without adding music coverage to edges', async () => {
    const startId = randomUUID();
    const sceneA = randomUUID();
    const sceneB = randomUUID();
    const endId = randomUUID();
    const musicId = randomUUID();
    const blocks = [
      { ...sceneBlock(startId, 0), blockType: 'start', name: null, prompt: null },
      sceneBlock(sceneA, 1),
      sceneBlock(sceneB, 2),
      { ...sceneBlock(endId, 9999), blockType: 'end', name: null, prompt: null },
    ];
    const edges = [
      { id: randomUUID(), draftId, sourceBlockId: startId, targetBlockId: sceneA },
      { id: randomUUID(), draftId, sourceBlockId: sceneA, targetBlockId: sceneB },
      { id: randomUUID(), draftId, sourceBlockId: sceneB, targetBlockId: endId },
    ];

    const putRes = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks, edges, musicBlocks: [musicBlock(musicId, sceneA, sceneB)] });

    expect(putRes.status, JSON.stringify(putRes.body)).toBe(200);
    expect(putRes.body.musicBlocks).toHaveLength(1);
    expect(putRes.body.musicBlocks[0]).toMatchObject({
      id: musicId,
      startSceneBlockId: sceneA,
      endSceneBlockId: sceneB,
      existingFileId: audioFileId,
    });

    const getRes = await request(app).get(`/storyboards/${draftId}`).set('Authorization', auth());
    expect(getRes.body.musicBlocks[0].id).toBe(musicId);
    const [edgeRows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_edges WHERE draft_id = ?',
      [draftId],
    );
    expect(Number(edgeRows[0]!['cnt'])).toBe(3);
  });

  it('preserves an active music generation job when autosave retains the music block', async () => {
    const sceneId = randomUUID();
    const musicId = randomUUID();
    const aiJobId = randomUUID();
    const mappingId = randomUUID();
    const block = sceneBlock(sceneId, 1);

    await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks: [block], edges: [], musicBlocks: [musicBlock(musicId, sceneId, sceneId)] });
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, draft_id)
       VALUES (?, ?, 'elevenlabs/music-v1', 'music_generation', 'music', '{}', ?)`,
      [aiJobId, userId, draftId],
    );
    await conn.execute(
      `INSERT INTO storyboard_music_generation_jobs
         (id, draft_id, music_block_id, ai_job_id, status, active_lock)
       VALUES (?, ?, ?, ?, 'queued', 1)`,
      [mappingId, draftId, musicId, aiJobId],
    );

    const movedMusic = { ...musicBlock(musicId, sceneId, sceneId), positionX: 260 };
    const putRes = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks: [{ ...block, positionX: 300 }], edges: [], musicBlocks: [movedMusic] });

    expect(putRes.status, JSON.stringify(putRes.body)).toBe(200);
    expect(putRes.body.musicBlocks[0]).toMatchObject({
      id: musicId,
      positionX: 260,
      generationStatus: 'queued',
      generationJobId: aiJobId,
    });
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM storyboard_music_generation_jobs WHERE ai_job_id = ?',
      [aiJobId],
    );
    expect(rows[0]!['id']).toBe(mappingId);
  });

  it('preserves music blocks and active job hydration when PUT omits musicBlocks', async () => {
    const sceneId = randomUUID();
    const musicId = randomUUID();
    const aiJobId = randomUUID();
    const mappingId = randomUUID();
    const block = sceneBlock(sceneId, 1);

    await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks: [block], edges: [], musicBlocks: [musicBlock(musicId, sceneId, sceneId)] });
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, draft_id)
       VALUES (?, ?, 'elevenlabs/music-v1', 'music_generation', 'music', '{}', ?)`,
      [aiJobId, userId, draftId],
    );
    await conn.execute(
      `INSERT INTO storyboard_music_generation_jobs
         (id, draft_id, music_block_id, ai_job_id, status, active_lock)
       VALUES (?, ?, ?, ?, 'queued', 1)`,
      [mappingId, draftId, musicId, aiJobId],
    );

    const putRes = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks: [{ ...block, positionX: 420 }], edges: [] });

    expect(putRes.status, JSON.stringify(putRes.body)).toBe(200);
    expect(putRes.body.musicBlocks).toHaveLength(1);
    expect(putRes.body.musicBlocks[0]).toMatchObject({
      id: musicId,
      draftId,
      startSceneBlockId: sceneId,
      endSceneBlockId: sceneId,
      generationStatus: 'queued',
      generationJobId: aiJobId,
    });
  });

  it('normalizes submitted music block draft ids to the route draft', async () => {
    const sceneId = randomUUID();
    const musicId = randomUUID();
    const wrongDraftId = randomUUID();
    const block = sceneBlock(sceneId, 1);

    const putRes = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({
        blocks: [block],
        edges: [],
        musicBlocks: [{ ...musicBlock(musicId, sceneId, sceneId), draftId: wrongDraftId }],
      });

    expect(putRes.status, JSON.stringify(putRes.body)).toBe(200);
    expect(putRes.body.musicBlocks[0]).toMatchObject({
      id: musicId,
      draftId,
      startSceneBlockId: sceneId,
      endSceneBlockId: sceneId,
    });
  });

  it('rejects music ranges when referenced scene ids are only present on another draft payload', async () => {
    const sceneId = randomUUID();
    const otherDraftId = randomUUID();
    const block = { ...sceneBlock(sceneId, 1), draftId: otherDraftId };

    const res = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({
        blocks: [block],
        edges: [],
        musicBlocks: [musicBlock(randomUUID(), sceneId, sceneId)],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('references a missing start scene');
  });

  it('rejects music ranges that reference missing scene blocks', async () => {
    const res = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({
        blocks: [],
        edges: [],
        musicBlocks: [musicBlock(randomUUID(), randomUUID(), randomUUID())],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('references a missing start scene');
  });

  it('rejects reversed music ranges using current storyboard order before replacing rows', async () => {
    const startId = randomUUID();
    const sceneA = randomUUID();
    const sceneB = randomUUID();
    const endId = randomUUID();
    const existingMusicId = randomUUID();
    const reversedMusicId = randomUUID();
    const blocks = [
      { ...sceneBlock(startId, 0), blockType: 'start', name: null, prompt: null },
      sceneBlock(sceneA, 1),
      sceneBlock(sceneB, 2),
      { ...sceneBlock(endId, 9999), blockType: 'end', name: null, prompt: null },
    ];
    const edges = [
      { id: randomUUID(), draftId, sourceBlockId: startId, targetBlockId: sceneA },
      { id: randomUUID(), draftId, sourceBlockId: sceneA, targetBlockId: sceneB },
      { id: randomUUID(), draftId, sourceBlockId: sceneB, targetBlockId: endId },
    ];

    const validRes = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks, edges, musicBlocks: [musicBlock(existingMusicId, sceneA, sceneB)] });
    expect(validRes.status, JSON.stringify(validRes.body)).toBe(200);

    const reversedRes = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks, edges, musicBlocks: [musicBlock(reversedMusicId, sceneB, sceneA)] });

    expect(reversedRes.status).toBe(400);
    expect(reversedRes.body.error).toContain('start scene must not come after end scene');
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, start_scene_block_id, end_scene_block_id FROM storyboard_music_blocks WHERE draft_id = ?',
      [draftId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: existingMusicId,
      start_scene_block_id: sceneA,
      end_scene_block_id: sceneB,
    });
  });

  it.each([
    ['another user', () => foreignAudioFileId],
    ['non-audio', () => imageFileId],
    ['non-ready audio', () => pendingAudioFileId],
  ])('rejects submitted existing music with a %s file on full PUT', async (_label, fileIdForCase) => {
    const sceneId = randomUUID();
    const block = sceneBlock(sceneId, 1);
    const invalidMusic = {
      ...musicBlock(randomUUID(), sceneId, sceneId),
      existingFileId: fileIdForCase(),
    };

    const res = await request(app)
      .put(`/storyboards/${draftId}`)
      .set('Authorization', auth())
      .send({ blocks: [block], edges: [], musicBlocks: [invalidMusic] });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('not a ready audio file');
  });
});
