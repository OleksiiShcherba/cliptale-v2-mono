/**
 * Repository for the `user_voices` table (migration 016).
 *
 * Stores ElevenLabs cloned voice records. Voices are user-scoped (not
 * project-scoped) — once cloned, a voice can be reused in any TTS or
 * speech-to-speech job for the same user.
 */
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** A cloned voice record as stored in `user_voices`. */
export type UserVoice = {
  voiceId: string;
  userId: string;
  label: string;
  elevenLabsVoiceId: string;
  createdAt: Date;
};

type VoiceRow = RowDataPacket & {
  voice_id: string;
  user_id: string;
  label: string;
  elevenlabs_voice_id: string;
  created_at: Date;
};

function mapRow(row: VoiceRow): UserVoice {
  return {
    voiceId: row.voice_id,
    userId: row.user_id,
    label: row.label,
    elevenLabsVoiceId: row.elevenlabs_voice_id,
    createdAt: row.created_at,
  };
}

/**
 * Inserts a new cloned voice record and returns the generated internal voice ID.
 *
 * Called by the media-worker after a successful ElevenLabs voiceClone API call.
 */
export async function createVoice(params: {
  userId: string;
  label: string;
  elevenLabsVoiceId: string;
}): Promise<string> {
  const voiceId = randomUUID();
  await pool.execute(
    `INSERT INTO user_voices (voice_id, user_id, label, elevenlabs_voice_id)
     VALUES (?, ?, ?, ?)`,
    [voiceId, params.userId, params.label, params.elevenLabsVoiceId],
  );
  return voiceId;
}

/**
 * Returns all voices belonging to a user, ordered newest first.
 */
export async function getVoicesByUserId(userId: string): Promise<UserVoice[]> {
  const [rows] = await pool.execute<VoiceRow[]>(
    `SELECT * FROM user_voices WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}
