import { describe, it, expect } from 'vitest';

import { registerSchema, loginSchema } from './auth.schema.js';

describe('registerSchema', () => {
  const valid = { email: 'user@example.com', password: 'password1', displayName: 'Alice' };

  describe('valid input', () => {
    it('accepts a fully valid registration body', () => {
      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('accepts a password of exactly 8 characters (boundary)', () => {
      const result = registerSchema.safeParse({ ...valid, password: '12345678' });
      expect(result.success).toBe(true);
    });

    it('accepts a password of exactly 128 characters (boundary)', () => {
      const result = registerSchema.safeParse({ ...valid, password: 'a'.repeat(128) });
      expect(result.success).toBe(true);
    });

    it('accepts an email up to 255 characters', () => {
      const localPart = 'a'.repeat(243);
      const result = registerSchema.safeParse({ ...valid, email: `${localPart}@b.com` });
      expect(result.success).toBe(true);
    });

    it('accepts a displayName of exactly 1 character (boundary)', () => {
      const result = registerSchema.safeParse({ ...valid, displayName: 'A' });
      expect(result.success).toBe(true);
    });

    it('accepts a displayName of exactly 255 characters (boundary)', () => {
      const result = registerSchema.safeParse({ ...valid, displayName: 'A'.repeat(255) });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid email', () => {
    it('rejects a missing email', () => {
      const { email: _email, ...rest } = valid;
      const result = registerSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects a non-email string', () => {
      const result = registerSchema.safeParse({ ...valid, email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    it('rejects an email exceeding 255 characters', () => {
      const result = registerSchema.safeParse({ ...valid, email: `${'a'.repeat(250)}@b.com` });
      expect(result.success).toBe(false);
    });
  });

  describe('invalid password', () => {
    it('rejects a missing password', () => {
      const { password: _password, ...rest } = valid;
      const result = registerSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects a password shorter than 8 characters', () => {
      const result = registerSchema.safeParse({ ...valid, password: '1234567' });
      expect(result.success).toBe(false);
    });

    it('rejects a password exceeding 128 characters', () => {
      const result = registerSchema.safeParse({ ...valid, password: 'a'.repeat(129) });
      expect(result.success).toBe(false);
    });
  });

  describe('invalid displayName', () => {
    it('rejects a missing displayName', () => {
      const { displayName: _displayName, ...rest } = valid;
      const result = registerSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects an empty displayName', () => {
      const result = registerSchema.safeParse({ ...valid, displayName: '' });
      expect(result.success).toBe(false);
    });

    it('rejects a displayName exceeding 255 characters', () => {
      const result = registerSchema.safeParse({ ...valid, displayName: 'A'.repeat(256) });
      expect(result.success).toBe(false);
    });
  });
});

describe('loginSchema', () => {
  const valid = { email: 'user@example.com', password: 'anypassword' };

  describe('valid input', () => {
    it('accepts a fully valid login body', () => {
      const result = loginSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('accepts a password of exactly 1 character (boundary — login allows any non-empty)', () => {
      const result = loginSchema.safeParse({ ...valid, password: 'x' });
      expect(result.success).toBe(true);
    });

    it('accepts a password of exactly 128 characters (boundary)', () => {
      const result = loginSchema.safeParse({ ...valid, password: 'a'.repeat(128) });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid email', () => {
    it('rejects a missing email', () => {
      const { email: _email, ...rest } = valid;
      const result = loginSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects a non-email string', () => {
      const result = loginSchema.safeParse({ ...valid, email: 'notanemail' });
      expect(result.success).toBe(false);
    });

    it('rejects an email exceeding 255 characters', () => {
      const result = loginSchema.safeParse({ ...valid, email: `${'a'.repeat(250)}@b.com` });
      expect(result.success).toBe(false);
    });
  });

  describe('invalid password', () => {
    it('rejects a missing password', () => {
      const { password: _password, ...rest } = valid;
      const result = loginSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects an empty password', () => {
      const result = loginSchema.safeParse({ ...valid, password: '' });
      expect(result.success).toBe(false);
    });

    it('rejects a password exceeding 128 characters', () => {
      const result = loginSchema.safeParse({ ...valid, password: 'a'.repeat(129) });
      expect(result.success).toBe(false);
    });
  });
});
