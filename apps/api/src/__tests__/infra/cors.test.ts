/**
 * Validates the S3 CORS configuration JSON at infra/s3/cors.json.
 *
 * These tests guard against accidental removal of required origins or methods
 * that would break browser uploads from any supported deployment origin.
 *
 * The authoritative cors.json lives at repo-root infra/s3/cors.json.
 * This test file lives in apps/api (a registered Turborepo workspace with
 * vitest configured) so that `turbo run test` picks it up in CI.
 *
 * Run from monorepo root:
 *   npm run test --workspace=apps/api -- --reporter=verbose cors
 *
 * Skip behaviour: when this test runs inside the api Docker container
 * (docker-compose mounts only ./apps/api:/app), infra/ is outside the mount
 * and cors.json is unreachable. Pattern B branches at module-top so that
 * readFileSync is never called during test collection when the file is absent.
 * Full-repo CI checkouts exercise all assertions as normal.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path from this file → repo root → infra/s3/cors.json
const corsPath = resolve(__dirname, '../../../../../infra/s3/cors.json');

const corsReachable = existsSync(corsPath);

if (!corsReachable) {
  console.warn(
    `[cors.test] skipped — cors.json not reachable at ${corsPath} ` +
      `(container-isolated runs; full-repo CI will exercise it)`,
  );

  // Pattern B: branch at module top so readFileSync is never called when file
  // is absent. describe.skipIf only skips inner it() bodies — the callback
  // body (including readFileSync) still runs during collection when absent.
  describe.skip('infra/s3/cors.json (skipped — cors.json unreachable)', () => {
    it('placeholder — skipped', () => {});
  });
} else {
  const corsConfig = JSON.parse(readFileSync(corsPath, 'utf-8')) as {
    CORSRules: Array<{
      AllowedOrigins: string[];
      AllowedMethods: string[];
      AllowedHeaders: string[];
      ExposeHeaders: string[];
      MaxAgeSeconds: number;
    }>;
  };

  describe('infra/s3/cors.json', () => {
    it('has at least one CORSRule', () => {
      expect(corsConfig.CORSRules).toBeDefined();
      expect(corsConfig.CORSRules.length).toBeGreaterThan(0);
    });

    describe('primary CORS rule', () => {
      const rule = corsConfig.CORSRules[0]!;

      it('allows the production nip.io origin', () => {
        expect(rule.AllowedOrigins).toContain('https://15-236-162-140.nip.io');
      });

      it('allows the local dev origin', () => {
        expect(rule.AllowedOrigins).toContain('http://localhost:5173');
      });

      it('does NOT use wildcard origin (credentialed flows require explicit origins)', () => {
        expect(rule.AllowedOrigins).not.toContain('*');
      });

      it('allows PUT method (required for presigned upload)', () => {
        expect(rule.AllowedMethods).toContain('PUT');
      });

      it('allows GET method', () => {
        expect(rule.AllowedMethods).toContain('GET');
      });

      it('allows HEAD method', () => {
        expect(rule.AllowedMethods).toContain('HEAD');
      });

      it('exposes ETag header (required by multipart upload finalisation)', () => {
        expect(rule.ExposeHeaders).toContain('ETag');
      });

      it('has MaxAgeSeconds set to 3000', () => {
        expect(rule.MaxAgeSeconds).toBe(3000);
      });

      it('AllowedHeaders is set (not empty)', () => {
        expect(rule.AllowedHeaders.length).toBeGreaterThan(0);
      });
    });
  });
}
