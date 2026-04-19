/**
 * Inline OpenAPI 3.1 spec for the ClipTale API.
 *
 * This file is the single source of truth for the API contract.
 * The file is hand-maintained — no codegen script watches it — so updates to
 * the spec and any consumer types must land in the same commit.
 *
 * Routes documented here:
 *  - GET /projects                               — list authenticated user's projects (Home hub)
 *  - POST /projects                              — create project with optional title (Home hub)
 *  - PATCH /projects/{projectId}/clips/{clipId}  — partial clip update (Epic 6)
 *  - GET /assets                                 — global wizard-gallery listing
 *  - POST/GET/PUT/DELETE /generation-drafts      — video generation wizard drafts
 *  - GET /generation-drafts/cards                — storyboard card summaries (Home hub)
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'ClipTale API',
    version: '1.0.0',
  },
  paths: {
    '/projects': {
      get: {
        summary: "List the authenticated user's projects",
        description:
          'Returns all projects owned by the authenticated user, sorted by updated_at DESC. ' +
          'Each project summary includes a derived thumbnailUrl from the earliest visual clip ' +
          '(video or image, ORDER BY start_frame ASC). Caption and audio clips are excluded. ' +
          'Returns null thumbnailUrl when no visual clip exists.',
        operationId: 'listProjects',
        tags: ['projects'],
        responses: {
          200: {
            description: 'List of project summaries.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListProjectsResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Authenticated user does not have editor role.' },
        },
        security: [{ bearerAuth: [] }],
      },
      post: {
        summary: 'Create a new project',
        description:
          'Creates a new empty project owned by the authenticated user. ' +
          'Accepts an optional title — defaults to "Untitled project".',
        operationId: 'createProject',
        tags: ['projects'],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProjectBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Project created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  properties: {
                    projectId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Authenticated user does not have editor role.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/projects/{projectId}/versions/latest': {
      get: {
        summary: 'Get the latest version of a project',
        description:
          'Returns the most recent saved version for the project, including the full `docJson` ' +
          'snapshot. Returns 404 when the project has no versions yet (new project).',
        operationId: 'getLatestVersion',
        tags: ['versions'],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'UUID of the project.',
          },
        ],
        responses: {
          200: {
            description: 'Latest version found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LatestVersionResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'User does not have viewer access to the project.' },
          404: { description: 'No versions exist for this project yet.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
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
    '/generation-drafts/cards': {
      get: {
        summary: "List storyboard card summaries for the authenticated user's drafts",
        description:
          'Returns a per-draft summary suitable for the Storyboard panel card grid. ' +
          'Each card includes a truncated text preview (≤140 chars from TextBlocks), ' +
          'up to 3 media preview entries resolved from project_assets_current, and status. ' +
          'Missing/deleted asset references are silently omitted — no 500 on dangling refs. ' +
          'Results are sorted by updated_at DESC, scoped to the authenticated user.',
        operationId: 'listStoryboardCards',
        tags: ['generation-drafts'],
        responses: {
          200: {
            description: 'List of storyboard card summaries.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListStoryboardCardsResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Authenticated user does not have editor role.' },
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
    '/generation-drafts/{id}/enhance': {
      post: {
        summary: 'Start an AI Enhance job for a generation draft',
        description:
          'Enqueues a BullMQ job that rewrites the draft\'s promptDoc via an LLM while ' +
          'preserving inline media-ref blocks. Returns the job ID to poll for status. ' +
          'Per-user rate limit: 10 requests per hour (HTTP 429 on breach).',
        operationId: 'startEnhancePrompt',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft to enhance.',
          },
        ],
        responses: {
          202: {
            description: 'Enhance job enqueued. Poll the returned jobId for status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StartEnhanceResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          429: { description: 'Per-user enhance rate limit exceeded (10 req/hr).' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-drafts/{id}/enhance/{jobId}': {
      get: {
        summary: 'Poll the status of an AI Enhance job',
        description:
          'Returns the current status of an enhance job. Status values: ' +
          '`queued` (waiting/delayed), `running` (active), `done` (completed — result populated), ' +
          '`failed` (failed — error populated). ' +
          'The job is retained for 1 hour after completion and 24 hours after failure.',
        operationId: 'getEnhanceStatus',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'BullMQ job ID returned by POST /generation-drafts/:id/enhance.',
          },
        ],
        responses: {
          200: {
            description: 'Current job status. `result` is present only when status=done; `error` only when status=failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EnhanceStatusResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found, or job has expired / was never created.' },
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
      ProjectSummary: {
        type: 'object',
        required: ['projectId', 'title', 'updatedAt', 'thumbnailUrl'],
        properties: {
          projectId: { type: 'string', format: 'uuid', description: 'UUID of the project.' },
          title: { type: 'string', description: 'Project title.' },
          updatedAt: { type: 'string', format: 'date-time', description: 'Last modified timestamp.' },
          thumbnailUrl: {
            type: ['string', 'null'],
            description:
              'Thumbnail URL derived from the earliest visual clip (video or image). ' +
              'Null when no visual clip exists.',
          },
        },
      },
      ListProjectsResponse: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProjectSummary' },
          },
        },
      },
      LatestVersionResponse: {
        type: 'object',
        required: ['versionId', 'docJson', 'createdAt'],
        properties: {
          versionId: {
            type: 'integer',
            description: 'ID of the latest version.',
          },
          docJson: {
            type: 'object',
            description: 'Full ProjectDoc snapshot at this version.',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when this version was saved.',
          },
        },
      },
      CreateProjectBody: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Optional project title. Defaults to "Untitled project" when omitted.',
          },
        },
      },
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
      StartEnhanceResponse: {
        type: 'object',
        required: ['jobId'],
        description: 'Returned by POST /generation-drafts/:id/enhance. Contains the BullMQ job ID.',
        properties: {
          jobId: {
            type: 'string',
            format: 'uuid',
            description: 'BullMQ job ID. Pass to GET /generation-drafts/:id/enhance/:jobId to poll.',
          },
        },
      },
      EnhanceStatusResponse: {
        type: 'object',
        required: ['status'],
        description: 'Returned by GET /generation-drafts/:id/enhance/:jobId.',
        properties: {
          status: {
            type: 'string',
            enum: ['queued', 'running', 'done', 'failed'],
            description:
              'Current job status. ' +
              '`queued` = waiting/delayed in queue; ' +
              '`running` = being processed; ' +
              '`done` = completed successfully; ' +
              '`failed` = errored or timed out.',
          },
          result: {
            type: 'object',
            description:
              'Proposed PromptDoc produced by the LLM. Present only when status=done. ' +
              'Conforms to promptDocSchema (schemaVersion:1, blocks array).',
          },
          error: {
            type: 'string',
            description: 'Human-readable error message. Present only when status=failed.',
          },
        },
      },
      MediaPreview: {
        type: 'object',
        required: ['fileId', 'type', 'thumbnailUrl'],
        description: 'A single resolved media-preview entry on a storyboard card.',
        properties: {
          fileId: { type: 'string', format: 'uuid', description: 'UUID of the file.' },
          type: {
            type: 'string',
            enum: ['video', 'image', 'audio'],
            description: 'Media bucket derived from the asset content-type.',
          },
          thumbnailUrl: {
            type: ['string', 'null'],
            description: 'API-proxy thumbnail URI, or null when no thumbnail exists for this asset.',
          },
        },
      },
      StoryboardCardSummary: {
        type: 'object',
        required: ['draftId', 'status', 'textPreview', 'mediaPreviews', 'updatedAt'],
        description: 'Per-draft summary for the Storyboard panel card grid.',
        properties: {
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the generation draft.' },
          status: {
            type: 'string',
            enum: ['draft', 'step2', 'step3', 'completed'],
            description: 'Current wizard progression status of the draft.',
          },
          textPreview: {
            type: 'string',
            maxLength: 140,
            description:
              'First ≤140 characters of concatenated TextBlock values from the promptDoc. ' +
              'Empty string when the draft contains no TextBlocks.',
          },
          mediaPreviews: {
            type: 'array',
            maxItems: 3,
            items: { $ref: '#/components/schemas/MediaPreview' },
            description:
              'First ≤3 resolved MediaRefBlock entries. ' +
              'Missing/deleted assets are silently excluded — length may be less than the ' +
              'number of MediaRefBlocks in the promptDoc.',
          },
          updatedAt: { type: 'string', format: 'date-time', description: 'Last-modified timestamp.' },
        },
      },
      ListStoryboardCardsResponse: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardCardSummary' },
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
