import { describe, it, expect } from 'vitest';

import { openApiSpec } from './openapi.js';

type Operation = Record<string, unknown>;
type Schema = Record<string, unknown>;

const paths = openApiSpec.paths as unknown as Record<string, Record<string, Operation>>;
const schemas = (openApiSpec as unknown as { components: { schemas: Record<string, Schema> } })
  .components.schemas;

describe('POST /files/stream-urls', () => {
  const op = paths['/files/stream-urls']?.post;

  it('exists with auth and a stable operationId', () => {
    expect(op).toBeDefined();
    expect(op.operationId).toBe('createFileStreamUrls');
    expect(op.tags).toContain('files');
    expect(op.security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
  });

  it('uses bulk stream URL request and response schemas', () => {
    const requestBody = op.requestBody as Record<string, unknown>;
    const bodySchema = (
      (requestBody.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
    ).schema as Record<string, unknown>;
    expect(requestBody.required).toBe(true);
    expect(bodySchema.$ref).toBe('#/components/schemas/CreateFileStreamUrlsBody');

    const responses = op.responses as Record<string, unknown>;
    const okSchema = (
      ((responses[200] as Record<string, unknown>).content as Record<string, unknown>)[
        'application/json'
      ] as Record<string, unknown>
    ).schema as Record<string, unknown>;
    expect(okSchema.$ref).toBe('#/components/schemas/FileStreamUrlsResponse');
    expect(responses[400]).toBeDefined();
    expect(responses[401]).toBeDefined();
  });
});

describe('file stream URL schemas', () => {
  it('caps request batches at 100 file IDs', () => {
    const body = schemas.CreateFileStreamUrlsBody;
    const props = body.properties as Record<string, Schema>;
    const fileIds = props.fileIds as Schema;

    expect(body.required).toContain('fileIds');
    expect(fileIds.type).toBe('array');
    expect(fileIds.minItems).toBe(1);
    expect(fileIds.maxItems).toBe(100);
    expect((fileIds.items as Schema).format).toBe('uuid');
  });

  it('returns a URL map and missingFileIds array', () => {
    const response = schemas.FileStreamUrlsResponse;
    const props = response.properties as Record<string, Schema>;

    expect(response.required).toEqual(['urls', 'missingFileIds']);
    expect(props.urls.type).toBe('object');
    expect(props.urls.additionalProperties).toEqual({ type: 'string' });
    expect(props.missingFileIds.type).toBe('array');
  });
});
