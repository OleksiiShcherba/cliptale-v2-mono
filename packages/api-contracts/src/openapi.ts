/**
 * Inline OpenAPI 3.1 spec for the ClipTale API.
 *
 * This file is the single source of truth for the API contract.
 * A generated TypeScript client (api-contracts) is derived from it.
 *
 * Routes documented here:
 *  - PATCH /projects/{projectId}/clips/{clipId}  — partial clip update (Epic 6)
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'ClipTale API',
    version: '1.0.0',
  },
  paths: {
    '/projects/{projectId}/clips/{clipId}': {
      patch: {
        summary: 'Partially update a clip',
        description:
          'Updates mutable timeline fields of a single clip in project_clips_current. ' +
          'Does NOT create a project_versions snapshot. ' +
          'Intended for high-frequency drag/trim events (≤60 req/s per project).',
        operationId: 'patchClip',
        tags: ['clips'],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'UUID of the project that owns the clip.',
          },
          {
            name: 'clipId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'UUID of the clip to update.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                properties: {
                  startFrame: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Timeline position in frames (0-based).',
                  },
                  durationFrames: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Clip length in frames.',
                  },
                  trimInFrames: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Frames trimmed from the start of the source asset.',
                  },
                  trimOutFrames: {
                    type: ['integer', 'null'],
                    minimum: 0,
                    description:
                      'Frames trimmed from the end of the source asset. Null means no trim.',
                  },
                  transform: {
                    oneOf: [
                      {
                        type: 'object',
                        additionalProperties: true,
                        description: 'Arbitrary transform properties (position, scale, rotation).',
                      },
                      { type: 'null' },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Clip updated successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    clipId: { type: 'string' },
                    startFrame: { type: 'integer' },
                    durationFrames: { type: 'integer' },
                    trimInFrames: { type: 'integer' },
                    trimOutFrames: { type: ['integer', 'null'] },
                    transform: { type: ['object', 'null'] },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                  required: ['clipId', 'startFrame', 'durationFrames', 'trimInFrames', 'updatedAt'],
                },
              },
            },
          },
          400: { description: 'Validation error — body failed Zod schema.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'User does not own the project.' },
          404: { description: 'Clip not found in project_clips_current.' },
          429: { description: 'Rate limit exceeded (60 req/s per project).' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
} as const;
