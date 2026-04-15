/**
 * Inline OpenAPI 3.1 spec for the ClipTale API.
 *
 * This file is the single source of truth for the API contract.
 * The file is hand-maintained — no codegen script watches it — so updates to
 * the spec and any consumer types must land in the same commit.
 *
 * Routes documented here:
 *  - PATCH /projects/{projectId}/clips/{clipId}  — partial clip update (Epic 6)
 *  - GET /assets                                 — global wizard-gallery listing
 *  - POST/GET/PUT/DELETE /generation-drafts      — video generation wizard drafts
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
    '/assets': {
      get: {
        summary: "List the authenticated user's ready assets (wizard gallery)",
        description:
          'Returns the caller\'s ready assets across all projects, filtered by media type, ' +
          'cursor-paginated newest-first, together with global totals per bucket. ' +
          'Powers the Step 1 wizard gallery and asset-picker modal.',
        operationId: 'listAssets',
        tags: ['assets'],
        parameters: [
          {
            name: 'type',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['video', 'image', 'audio', 'all'],
              default: 'all',
            },
            description: 'Filter by media type. `all` returns every bucket.',
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Opaque cursor returned as `nextCursor` from a previous call. ' +
              'Omit on the first page.',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 24 },
            description: 'Maximum items to return per page.',
          },
        ],
        responses: {
          200: {
            description: 'Page of asset summaries plus totals.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListAssetsResponse' },
              },
            },
          },
          400: { description: 'Invalid cursor.' },
          401: { description: 'Missing or invalid session token.' },
          422: { description: 'Unknown `type` value rejected by query validation.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-drafts': {
      post: {
        summary: 'Create a generation draft',
        operationId: 'createGenerationDraft',
        tags: ['generation-drafts'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpsertGenerationDraftBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Draft created.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerationDraft' },
              },
            },
          },
          400: { description: 'Validation failed — request body missing or malformed.' },
          401: { description: 'Missing or invalid session token.' },
          422: { description: 'PromptDoc failed schema validation.' },
        },
        security: [{ bearerAuth: [] }],
      },
      get: {
        summary: 'List generation drafts for the authenticated user',
        operationId: 'listGenerationDrafts',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'mine',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
            description: 'Pass true to scope results to the authenticated user.',
          },
        ],
        responses: {
          200: {
            description: 'Array of drafts (may be empty).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GenerationDraft' },
                },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-drafts/{id}': {
      get: {
        summary: 'Get a single generation draft',
        operationId: 'getGenerationDraft',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
        ],
        responses: {
          200: {
            description: 'Draft retrieved.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerationDraft' },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
        },
        security: [{ bearerAuth: [] }],
      },
      put: {
        summary: 'Replace the promptDoc of an existing generation draft',
        operationId: 'updateGenerationDraft',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpsertGenerationDraftBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Draft updated.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerationDraft' },
              },
            },
          },
          400: { description: 'Validation failed — request body missing or malformed.' },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'PromptDoc failed schema validation.' },
        },
        security: [{ bearerAuth: [] }],
      },
      delete: {
        summary: 'Delete a generation draft',
        operationId: 'deleteGenerationDraft',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
        ],
        responses: {
          204: { description: 'Draft deleted.' },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
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
    schemas: {
      GenerationDraft: {
        type: 'object',
        required: ['id', 'userId', 'promptDoc', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the draft.' },
          userId: { type: 'string', description: 'UUID of the owning user.' },
          promptDoc: {
            type: 'object',
            description: 'The PromptDoc block document (schemaVersion + blocks array).',
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UpsertGenerationDraftBody: {
        type: 'object',
        required: ['promptDoc'],
        properties: {
          promptDoc: {
            type: 'object',
            description: 'PromptDoc to persist. Must conform to the promptDocSchema (schemaVersion:1, blocks array).',
          },
        },
      },
      AssetSummary: {
        type: 'object',
        required: ['id', 'type', 'label', 'durationSeconds', 'thumbnailUrl', 'createdAt'],
        properties: {
          id: { type: 'string', description: 'UUID of the asset.' },
          type: {
            type: 'string',
            enum: ['video', 'image', 'audio'],
            description: 'Media bucket derived from the asset content-type.',
          },
          label: {
            type: 'string',
            description: 'Display label — falls back from displayName to filename.',
          },
          durationSeconds: {
            type: ['number', 'null'],
            description: 'Derived from duration_frames / fps. Null when unknown.',
          },
          thumbnailUrl: {
            type: ['string', 'null'],
            description: 'API-proxy thumbnail URL, or null when no thumbnail exists.',
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AssetTotals: {
        type: 'object',
        required: ['videos', 'images', 'audio', 'bytesUsed'],
        properties: {
          videos: { type: 'integer', minimum: 0 },
          images: { type: 'integer', minimum: 0 },
          audio: { type: 'integer', minimum: 0 },
          bytesUsed: { type: 'integer', minimum: 0 },
        },
      },
      ListAssetsResponse: {
        type: 'object',
        required: ['items', 'nextCursor', 'totals'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/AssetSummary' },
          },
          nextCursor: {
            type: ['string', 'null'],
            description: 'Opaque cursor for the next page, or null at end of list.',
          },
          totals: { $ref: '#/components/schemas/AssetTotals' },
        },
      },
    },
  },
} as const;
