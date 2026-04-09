import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Valid AI provider identifiers — must match the ENUM in migration 009. */
export type AiProvider =
  | 'openai'
  | 'runway'
  | 'stability_ai'
  | 'elevenlabs'
  | 'kling'
  | 'pika'
  | 'suno'
  | 'replicate';

/** Row shape returned by SELECT on ai_provider_configs. */
export type AiProviderConfig = {
  configId: number;
  userId: string;
  provider: AiProvider;
  apiKeyEncrypted: Buffer;
  encryptionIv: Buffer;
  encryptionTag: Buffer;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AiProviderRow = RowDataPacket & {
  config_id: number;
  user_id: string;
  provider: AiProvider;
  api_key_encrypted: Buffer;
  encryption_iv: Buffer;
  encryption_tag: Buffer;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: AiProviderRow): AiProviderConfig {
  return {
    configId: row.config_id,
    userId: row.user_id,
    provider: row.provider,
    apiKeyEncrypted: row.api_key_encrypted,
    encryptionIv: row.encryption_iv,
    encryptionTag: row.encryption_tag,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Inserts a new provider config row. */
export async function createConfig(params: {
  userId: string;
  provider: AiProvider;
  apiKeyEncrypted: Buffer;
  encryptionIv: Buffer;
  encryptionTag: Buffer;
}): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO ai_provider_configs
       (user_id, provider, api_key_encrypted, encryption_iv, encryption_tag)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.userId,
      params.provider,
      params.apiKeyEncrypted,
      params.encryptionIv,
      params.encryptionTag,
    ],
  );
  return result.insertId;
}

/** Returns all provider configs for a user. */
export async function getConfigsByUserId(
  userId: string,
): Promise<AiProviderConfig[]> {
  const [rows] = await pool.execute<AiProviderRow[]>(
    'SELECT * FROM ai_provider_configs WHERE user_id = ? ORDER BY created_at ASC',
    [userId],
  );
  return rows.map(mapRow);
}

/** Returns a single config for a user + provider pair, or null. */
export async function getConfigByUserAndProvider(
  userId: string,
  provider: AiProvider,
): Promise<AiProviderConfig | null> {
  const [rows] = await pool.execute<AiProviderRow[]>(
    'SELECT * FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
    [userId, provider],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/** Updates encrypted key and/or active status for an existing config. */
export async function updateConfig(
  userId: string,
  provider: AiProvider,
  fields:
    | { apiKeyEncrypted: Buffer; encryptionIv: Buffer; encryptionTag: Buffer; isActive?: boolean }
    | { isActive: boolean },
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | Buffer | null)[] = [];

  if ('apiKeyEncrypted' in fields) {
    setClauses.push('api_key_encrypted = ?');
    values.push(fields.apiKeyEncrypted);
    setClauses.push('encryption_iv = ?');
    values.push(fields.encryptionIv);
    setClauses.push('encryption_tag = ?');
    values.push(fields.encryptionTag);
  }
  if ('isActive' in fields) {
    setClauses.push('is_active = ?');
    values.push(fields.isActive ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  values.push(userId, provider);
  await pool.execute(
    `UPDATE ai_provider_configs SET ${setClauses.join(', ')} WHERE user_id = ? AND provider = ?`,
    values,
  );
}

/** Deletes a provider config for a user + provider pair. */
export async function deleteConfig(
  userId: string,
  provider: AiProvider,
): Promise<void> {
  await pool.execute(
    'DELETE FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
    [userId, provider],
  );
}
