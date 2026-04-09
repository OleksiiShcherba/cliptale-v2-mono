/** AES-256-GCM encryption/decryption for sensitive data (e.g. AI provider API keys).
 *
 * Uses Node.js built-in `crypto` — no external dependencies.
 * The encryption key is read from `config.encryption.key`.
 */

import crypto from 'node:crypto';

import { config } from '@/config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/** Derives the 32-byte key buffer from the hex-encoded config value. */
function getKeyBuffer(): Buffer {
  return Buffer.from(config.encryption.key, 'hex');
}

type EncryptResult = {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
};

/** Encrypts a plaintext string using AES-256-GCM with a random IV. */
export function encryptString(plaintext: string): EncryptResult {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return { encrypted, iv, tag };
}

/** Decrypts AES-256-GCM ciphertext back to the original plaintext string. */
export function decryptString(
  encrypted: Buffer,
  iv: Buffer,
  tag: Buffer,
): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
