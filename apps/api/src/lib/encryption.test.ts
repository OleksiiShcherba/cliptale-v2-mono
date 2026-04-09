import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { VALID_KEY_HEX } = vi.hoisted(() => {
  const c = require('node:crypto') as typeof import('node:crypto');
  return { VALID_KEY_HEX: c.randomBytes(32).toString('hex') };
});

vi.mock('@/config.js', () => ({
  config: {
    encryption: { key: VALID_KEY_HEX },
  },
}));

import { encryptString, decryptString } from './encryption.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encryptString / decryptString roundtrip', () => {
    it('recovers the original plaintext after encrypt → decrypt', () => {
      const plaintext = 'sk-abc123-my-secret-api-key';
      const { encrypted, iv, tag } = encryptString(plaintext);
      const result = decryptString(encrypted, iv, tag);

      expect(result).toBe(plaintext);
    });

    it('works with an empty string', () => {
      const plaintext = '';
      const { encrypted, iv, tag } = encryptString(plaintext);
      const result = decryptString(encrypted, iv, tag);

      expect(result).toBe(plaintext);
    });

    it('works with unicode characters', () => {
      const plaintext = 'api-key-with-émojis-🔑-and-日本語';
      const { encrypted, iv, tag } = encryptString(plaintext);
      const result = decryptString(encrypted, iv, tag);

      expect(result).toBe(plaintext);
    });

    it('works with a long string', () => {
      const plaintext = 'x'.repeat(1000);
      const { encrypted, iv, tag } = encryptString(plaintext);
      const result = decryptString(encrypted, iv, tag);

      expect(result).toBe(plaintext);
    });
  });

  describe('encryptString', () => {
    it('returns encrypted, iv, and tag as Buffers', () => {
      const { encrypted, iv, tag } = encryptString('test');

      expect(Buffer.isBuffer(encrypted)).toBe(true);
      expect(Buffer.isBuffer(iv)).toBe(true);
      expect(Buffer.isBuffer(tag)).toBe(true);
    });

    it('returns a 16-byte IV', () => {
      const { iv } = encryptString('test');
      expect(iv.length).toBe(16);
    });

    it('returns a 16-byte auth tag', () => {
      const { tag } = encryptString('test');
      expect(tag.length).toBe(16);
    });

    it('produces different ciphertext on each call (random IV)', () => {
      const plaintext = 'same-input';
      const result1 = encryptString(plaintext);
      const result2 = encryptString(plaintext);

      expect(result1.iv.equals(result2.iv)).toBe(false);
      expect(result1.encrypted.equals(result2.encrypted)).toBe(false);
    });
  });

  describe('decryptString — failure cases', () => {
    it('throws when the auth tag is tampered with', () => {
      const { encrypted, iv, tag } = encryptString('secret');
      const tamperedTag = Buffer.from(tag);
      tamperedTag[0] = (tamperedTag[0]! + 1) % 256;

      expect(() => decryptString(encrypted, iv, tamperedTag)).toThrow();
    });

    it('throws when the ciphertext is tampered with', () => {
      const { encrypted, iv, tag } = encryptString('secret');
      const tamperedEncrypted = Buffer.from(encrypted);
      tamperedEncrypted[0] = (tamperedEncrypted[0]! + 1) % 256;

      expect(() => decryptString(tamperedEncrypted, iv, tag)).toThrow();
    });

    it('throws when the IV is wrong', () => {
      const { encrypted, tag } = encryptString('secret');
      const wrongIv = crypto.randomBytes(16);

      expect(() => decryptString(encrypted, wrongIv, tag)).toThrow();
    });
  });
});
