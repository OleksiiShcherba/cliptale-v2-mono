# S3 Bucket Infrastructure

This directory contains the S3 bucket configuration files applied to:
**Bucket:** `oleksii-shcherba-test-store-364205735765-eu-west-3-an`
**Region:** `eu-west-3`
**AWS Account:** `364205735765`

## CORS Configuration (`cors.json`)

The `cors.json` file contains the CORS rules for the S3 bucket. It must be applied
whenever the bucket is created or recreated.

### Apply CORS rule

```bash
AWS_ACCESS_KEY_ID=<key> AWS_SECRET_ACCESS_KEY=<secret> \
  aws s3api put-bucket-cors \
  --bucket oleksii-shcherba-test-store-364205735765-eu-west-3-an \
  --region eu-west-3 \
  --cors-configuration file://infra/s3/cors.json
```

### Verify CORS rule

```bash
AWS_ACCESS_KEY_ID=<key> AWS_SECRET_ACCESS_KEY=<secret> \
  aws s3api get-bucket-cors \
  --bucket oleksii-shcherba-test-store-364205735765-eu-west-3-an \
  --region eu-west-3
```

### Regression tests

The vitest regression tests for `cors.json` live in:

```
apps/api/src/__tests__/infra/cors.test.ts
```

They are part of the `apps/api` Turborepo workspace (which runs vitest) so they are
discovered and executed by `turbo run test`. The test reads `cors.json` from the repo
root via a computed path — do not duplicate `cors.json` elsewhere.

To run just the CORS tests:

```bash
npm run test --workspace=apps/api -- --reporter=verbose cors
```

### Notes

- `AllowedOrigins` must be an explicit list (NOT `*`) so credentialed flows are supported.
- When adding a new deployment origin, add it to this file and re-apply.
- `Content-Type` is currently NOT part of the presigned URL signature (SignedHeaders: content-length;host).
  If the server-side presign ever starts signing `Content-Type` or checksum headers,
  revisit `AllowedHeaders` here (see subtask 6 of migration/assetId-to-fileId-cleanup).
