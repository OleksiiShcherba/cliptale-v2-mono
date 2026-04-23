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
 *  - POST /storyboards/{draftId}/initialize      — seed START/END sentinel blocks
 *  - GET /storyboards/{draftId}                  — fetch blocks + edges for a draft
 *  - PUT /storyboards/{draftId}                  — full-replace blocks + edges
 *  - GET /storyboards/{draftId}/history          — list last 50 history snapshots
 *  - POST /storyboards/{draftId}/history         — push a new history snapshot
 *  - GET /scene-templates                        — list user's scene templates
 *  - POST /scene-templates                       — create scene template
 *  - GET /scene-templates/{id}                   — get scene template by id
 *  - PUT /scene-templates/{id}                   — update scene template
 *  - DELETE /scene-templates/{id}                — soft-delete scene template
 *  - POST /scene-templates/{id}/add-to-storyboard — add template as storyboard block
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
    '/projects/{projectId}/assets': {
      get: {
        summary: "List a project's assets, paginated",
        description:
          'Returns a cursor-paginated envelope of files linked to the project (`scope=project`, ' +
          'default) or all files owned by the user (`scope=all`). ' +
          'The `totals` field reflects the full un-paged count and total bytes. ' +
          '`nextCursor` is null on the last page.',
        operationId: 'listProjectAssets',
        tags: ['assets'],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the project.',
          },
          {
            name: 'scope',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['project', 'all'],
              default: 'project',
            },
            description:
              '`project` (default) returns files linked via project_files. ' +
              '`all` returns every file owned by the authenticated user.',
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
            description: 'Maximum items per page. Clamped to [1, 100].',
          },
        ],
        responses: {
          200: {
            description: 'Paginated list of project assets with totals.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetListResponse' },
              },
            },
          },
          400: {
            description:
              'Validation error — invalid `scope`, `limit` out of range, or malformed `cursor`.',
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'User does not own the project.' },
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
    '/generation-drafts/{id}/assets': {
      get: {
        summary: "List assets linked to a generation draft",
        description:
          'Returns a paginated envelope of files linked to the draft (`scope=draft`, default) ' +
          'or all files owned by the user (`scope=all`). ' +
          '`nextCursor` is always null for the draft scope (no keyset pagination — drafts have ' +
          'at most a handful of linked files). `totals` reflects the count and bytes of the ' +
          'returned items. Items use the `AssetApiResponse` shape.',
        operationId: 'listDraftAssets',
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
            name: 'scope',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['draft', 'all'],
              default: 'draft',
            },
            description:
              '`draft` (default) returns files linked via draft_files. ' +
              '`all` returns every file owned by the authenticated user.',
          },
        ],
        responses: {
          200: {
            description: 'Paginated list of draft assets with totals.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetListResponse' },
              },
            },
          },
          400: { description: 'Validation error — invalid `scope` value.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
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
    '/storyboards/{draftId}/initialize': {
      post: {
        summary: 'Initialize storyboard sentinel blocks',
        description:
          'Idempotently seeds START and END sentinel blocks for a generation draft when they do ' +
          'not yet exist. Safe to call multiple times — subsequent calls return the current state ' +
          'unchanged. Returns the full storyboard state (blocks + edges) after initialization.',
        operationId: 'initializeStoryboard',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
        ],
        responses: {
          200: {
            description: 'Storyboard initialized (or already initialized). Returns current state.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardState' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}': {
      get: {
        summary: 'Get storyboard state',
        description:
          'Returns the full storyboard state (all blocks with their media items, and all directed ' +
          'edges) for a generation draft. Blocks are ordered by sort_order ASC.',
        operationId: 'getStoryboard',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
        ],
        responses: {
          200: {
            description: 'Storyboard blocks and edges.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardState' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
        },
        security: [{ bearerAuth: [] }],
      },
      put: {
        summary: 'Save storyboard state',
        description:
          'Full-replaces all blocks and edges in a single DB transaction. All existing blocks ' +
          '(and their cascaded edges and media) are deleted before the provided arrays are ' +
          'inserted. Returns the saved state after re-loading from the database.',
        operationId: 'putStoryboard',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
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
              schema: { $ref: '#/components/schemas/SaveStoryboardBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Storyboard saved. Returns the authoritative post-save state.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardState' },
              },
            },
          },
          400: { description: 'Validation error — request body failed Zod schema.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/history': {
      get: {
        summary: 'List storyboard history snapshots',
        description:
          'Returns the last 50 history snapshots for a draft, ordered newest-first. ' +
          'Each entry contains the snapshot JSON, the row id, and a createdAt timestamp.',
        operationId: 'listStoryboardHistory',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
        ],
        responses: {
          200: {
            description: 'Array of history snapshots (newest first, at most 50 entries).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/StoryboardHistoryEntry' },
                },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
        },
        security: [{ bearerAuth: [] }],
      },
      post: {
        summary: 'Push a storyboard history snapshot',
        description:
          'Inserts a new history snapshot for the draft and prunes the table beyond 50 rows ' +
          '(oldest entries are deleted). Returns 201 with the auto-assigned row id.',
        operationId: 'pushStoryboardHistory',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
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
              schema: { $ref: '#/components/schemas/PushHistoryBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Snapshot inserted. Returns the auto-assigned row id.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'integer', description: 'Auto-incremented row id of the inserted snapshot.' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error — request body failed Zod schema.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/scene-templates': {
      get: {
        summary: "List the authenticated user's scene templates",
        description:
          'Returns all active (non-deleted) scene templates owned by the authenticated user, ' +
          'ordered by created_at DESC. Each template includes its media items.',
        operationId: 'listSceneTemplates',
        tags: ['scene-templates'],
        responses: {
          200: {
            description: 'List of scene templates.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SceneTemplate' },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
        },
        security: [{ bearerAuth: [] }],
      },
      post: {
        summary: 'Create a new scene template',
        description:
          'Creates a scene template with name, prompt, duration_s, style, and an optional ' +
          'media array (up to 6 items). Returns 201 with the created template.',
        operationId: 'createSceneTemplate',
        tags: ['scene-templates'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateSceneTemplateBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Template created.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SceneTemplate' },
              },
            },
          },
          400: { description: 'Validation error — body failed Zod schema or media limit exceeded.' },
          401: { description: 'Missing or invalid JWT.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/scene-templates/{id}': {
      get: {
        summary: 'Get a scene template by id',
        description:
          'Returns the scene template. Returns 404 if the template does not exist or ' +
          'is not owned by the authenticated user.',
        operationId: 'getSceneTemplate',
        tags: ['scene-templates'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the scene template.',
          },
        ],
        responses: {
          200: {
            description: 'Scene template found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SceneTemplate' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          404: { description: 'Template not found or not owned by caller.' },
        },
        security: [{ bearerAuth: [] }],
      },
      put: {
        summary: 'Update a scene template',
        description:
          'Updates the template fields and atomically replaces its media list. ' +
          'Returns 200 with the updated template.',
        operationId: 'updateSceneTemplate',
        tags: ['scene-templates'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the scene template.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateSceneTemplateBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Template updated.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SceneTemplate' },
              },
            },
          },
          400: { description: 'Validation error — body failed Zod schema or media limit exceeded.' },
          401: { description: 'Missing or invalid JWT.' },
          404: { description: 'Template not found or not owned by caller.' },
        },
        security: [{ bearerAuth: [] }],
      },
      delete: {
        summary: 'Soft-delete a scene template',
        description: 'Sets deleted_at on the template. Returns 204 on success.',
        operationId: 'deleteSceneTemplate',
        tags: ['scene-templates'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the scene template.',
          },
        ],
        responses: {
          204: { description: 'Template soft-deleted.' },
          401: { description: 'Missing or invalid JWT.' },
          404: { description: 'Template not found or not owned by caller.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/scene-templates/{id}/add-to-storyboard': {
      post: {
        summary: 'Add a scene template to a storyboard draft',
        description:
          'Creates a new storyboard_blocks row from the template data and inserts ' +
          'storyboard_block_media rows for each template media item. ' +
          'Requires the authenticated user to own both the template and the draft. ' +
          'Returns 201 with the new StoryboardBlock.',
        operationId: 'addSceneTemplateToStoryboard',
        tags: ['scene-templates'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the scene template.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AddToStoryboardPayload' },
            },
          },
        },
        responses: {
          201: {
            description: 'Storyboard block created from template.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardBlock' },
              },
            },
          },
          400: { description: 'Validation error — body failed Zod schema.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Template or draft not found / not owned by caller.' },
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
      AssetApiResponseItem: {
        type: 'object',
        required: [
          'id', 'projectId', 'filename', 'contentType', 'downloadUrl',
          'status', 'createdAt', 'updatedAt',
        ],
        description:
          'One file/asset as returned by GET /projects/:id/assets. ' +
          'Maps to the AssetApiResponse shape in the API layer.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the file.' },
          projectId: {
            type: 'string',
            description: 'UUID of the project this response was scoped to.',
          },
          filename: { type: 'string', description: 'Primary display label.' },
          displayName: { type: ['string', 'null'], description: 'User-editable display name.' },
          contentType: { type: 'string', description: 'MIME type of the file.' },
          downloadUrl: { type: 'string', description: 'Presigned S3 download URL.' },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'ready', 'error'],
            description: 'Ingest lifecycle status.',
          },
          durationSeconds: { type: ['number', 'null'], description: 'Duration in seconds, or null.' },
          width: { type: ['integer', 'null'], description: 'Video/image width in pixels.' },
          height: { type: ['integer', 'null'], description: 'Video/image height in pixels.' },
          fileSizeBytes: { type: ['integer', 'null'], description: 'Raw file size in bytes.' },
          thumbnailUri: {
            type: ['string', 'null'],
            description: 'S3/R2 URI of the thumbnail (not yet populated).',
          },
          waveformPeaks: { type: ['array', 'null'], description: 'Audio waveform peaks (not yet populated).' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectAssetsTotals: {
        type: 'object',
        required: ['count', 'bytesUsed'],
        properties: {
          count: { type: 'integer', minimum: 0, description: 'Total number of files (unpaged).' },
          bytesUsed: { type: 'integer', minimum: 0, description: 'Total bytes across all files.' },
        },
      },
      AssetListResponse: {
        type: 'object',
        required: ['items', 'nextCursor', 'totals'],
        description: 'Paginated response envelope for GET /projects/:id/assets.',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/AssetApiResponseItem' },
          },
          nextCursor: {
            type: ['string', 'null'],
            description: 'Opaque cursor for the next page. Null when this is the last page.',
          },
          totals: { $ref: '#/components/schemas/ProjectAssetsTotals' },
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
      BlockMediaItem: {
        type: 'object',
        required: ['id', 'fileId', 'mediaType', 'sortOrder'],
        description: 'A single media attachment on a storyboard block.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the media item.' },
          fileId: { type: 'string', format: 'uuid', description: 'UUID of the linked file.' },
          mediaType: {
            type: 'string',
            enum: ['image', 'video', 'audio'],
            description: 'Media bucket for the linked file.',
          },
          sortOrder: { type: 'integer', minimum: 0, description: 'Display order within the block.' },
        },
      },
      StoryboardBlock: {
        type: 'object',
        required: [
          'id', 'draftId', 'blockType', 'name', 'prompt', 'durationS',
          'positionX', 'positionY', 'sortOrder', 'style', 'createdAt', 'updatedAt', 'mediaItems',
        ],
        description: 'A fully-hydrated storyboard block returned from the API.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the block.' },
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the owning draft.' },
          blockType: {
            type: 'string',
            enum: ['start', 'end', 'scene'],
            description: 'Block category: start/end are sentinels; scene is user-created.',
          },
          name: { type: ['string', 'null'], maxLength: 255, description: 'User-editable scene name.' },
          prompt: { type: ['string', 'null'], description: 'AI generation prompt for this scene.' },
          durationS: { type: 'integer', minimum: 1, description: 'Intended scene duration in seconds.' },
          positionX: { type: 'number', description: 'Canvas X position in logical pixels.' },
          positionY: { type: 'number', description: 'Canvas Y position in logical pixels.' },
          sortOrder: { type: 'integer', minimum: 0, description: 'Render/export ordering key.' },
          style: { type: ['string', 'null'], maxLength: 64, description: 'AI style preset key.' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          mediaItems: {
            type: 'array',
            items: { $ref: '#/components/schemas/BlockMediaItem' },
            description: 'Media attachments ordered by sortOrder ASC.',
          },
        },
      },
      StoryboardEdge: {
        type: 'object',
        required: ['id', 'draftId', 'sourceBlockId', 'targetBlockId'],
        description: 'A directed edge between two storyboard blocks.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the edge.' },
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the owning draft.' },
          sourceBlockId: { type: 'string', format: 'uuid', description: 'UUID of the source block.' },
          targetBlockId: { type: 'string', format: 'uuid', description: 'UUID of the target block.' },
        },
      },
      StoryboardState: {
        type: 'object',
        required: ['blocks', 'edges'],
        description: 'Full storyboard state returned by GET, PUT, and POST /initialize.',
        properties: {
          blocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardBlock' },
            description: 'All blocks for the draft, ordered by sortOrder ASC.',
          },
          edges: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardEdge' },
            description: 'All directed edges for the draft.',
          },
        },
      },
      BlockInsert: {
        type: 'object',
        required: [
          'id', 'draftId', 'blockType', 'name', 'prompt', 'durationS',
          'positionX', 'positionY', 'sortOrder', 'style',
        ],
        description: 'A single block in the PUT /storyboards/:draftId request body.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the block (client-generated).' },
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the owning draft.' },
          blockType: {
            type: 'string',
            enum: ['start', 'end', 'scene'],
            description: 'Block category.',
          },
          name: { type: ['string', 'null'], maxLength: 255, description: 'User-editable scene name.' },
          prompt: { type: ['string', 'null'], description: 'AI generation prompt.' },
          durationS: { type: 'integer', minimum: 1, default: 5, description: 'Scene duration in seconds.' },
          positionX: { type: 'number', description: 'Canvas X position.' },
          positionY: { type: 'number', description: 'Canvas Y position.' },
          sortOrder: { type: 'integer', minimum: 0, description: 'Ordering key.' },
          style: { type: ['string', 'null'], maxLength: 64, description: 'AI style preset key.' },
          mediaItems: {
            type: 'array',
            items: { $ref: '#/components/schemas/BlockMediaItem' },
            description: 'Optional media items — present in GET responses but ignored on PUT (not persisted via this endpoint).',
          },
        },
      },
      EdgeInsert: {
        type: 'object',
        required: ['id', 'draftId', 'sourceBlockId', 'targetBlockId'],
        description: 'A single edge in the PUT /storyboards/:draftId request body.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the edge (client-generated).' },
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the owning draft.' },
          sourceBlockId: { type: 'string', format: 'uuid', description: 'UUID of the source block.' },
          targetBlockId: { type: 'string', format: 'uuid', description: 'UUID of the target block.' },
        },
      },
      SaveStoryboardBody: {
        type: 'object',
        required: ['blocks', 'edges'],
        description: 'Request body for PUT /storyboards/:draftId.',
        properties: {
          blocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/BlockInsert' },
            description: 'Complete set of blocks to persist (replaces existing).',
          },
          edges: {
            type: 'array',
            items: { $ref: '#/components/schemas/EdgeInsert' },
            description: 'Complete set of edges to persist (replaces existing).',
          },
        },
      },
      PushHistoryBody: {
        type: 'object',
        required: ['snapshot'],
        description: 'Request body for POST /storyboards/:draftId/history.',
        properties: {
          snapshot: {
            type: 'object',
            description:
              'Opaque storyboard snapshot. Typically a StoryboardState-compatible object, ' +
              'but the server stores it as-is without schema validation.',
          },
        },
      },
      StoryboardHistoryEntry: {
        type: 'object',
        required: ['id', 'draftId', 'snapshot', 'createdAt'],
        description: 'A single history snapshot entry returned by GET /storyboards/:draftId/history.',
        properties: {
          id: { type: 'integer', description: 'Auto-incremented row id.' },
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the owning draft.' },
          snapshot: {
            type: 'object',
            description: 'The stored storyboard snapshot JSON.',
          },
          createdAt: { type: 'string', format: 'date-time', description: 'When this snapshot was pushed.' },
        },
      },
      SceneTemplateMedia: {
        type: 'object',
        required: ['id', 'fileId', 'mediaType', 'sortOrder'],
        description: 'A single media attachment on a scene template.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the media item.' },
          fileId: { type: 'string', format: 'uuid', description: 'UUID of the linked file.' },
          mediaType: {
            type: 'string',
            enum: ['image', 'video', 'audio'],
            description: 'Media bucket for the linked file.',
          },
          sortOrder: { type: 'integer', minimum: 0, description: 'Display order within the template.' },
        },
      },
      SceneTemplate: {
        type: 'object',
        required: ['id', 'userId', 'name', 'prompt', 'durationS', 'style', 'createdAt', 'updatedAt', 'mediaItems'],
        description: 'A fully-hydrated scene template returned from the API.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the template.' },
          userId: { type: 'string', description: 'UUID of the owning user.' },
          name: { type: 'string', maxLength: 255, description: 'User-visible template name.' },
          prompt: { type: 'string', description: 'AI generation prompt for this template.' },
          durationS: { type: 'integer', minimum: 1, description: 'Intended scene duration in seconds.' },
          style: { type: ['string', 'null'], maxLength: 64, description: 'AI style preset key, or null.' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          mediaItems: {
            type: 'array',
            maxItems: 6,
            items: { $ref: '#/components/schemas/SceneTemplateMedia' },
            description: 'Media attachments ordered by sortOrder ASC.',
          },
        },
      },
      CreateSceneTemplateBody: {
        type: 'object',
        required: ['name', 'prompt', 'durationS'],
        description: 'Request body for POST /scene-templates and PUT /scene-templates/:id.',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255, description: 'Template name.' },
          prompt: { type: 'string', minLength: 1, description: 'AI generation prompt.' },
          durationS: { type: 'integer', minimum: 1, maximum: 180, description: 'Scene duration in seconds.' },
          style: { type: ['string', 'null'], maxLength: 64, description: 'AI style preset key, or null.' },
          mediaItems: {
            type: 'array',
            maxItems: 6,
            items: {
              type: 'object',
              required: ['fileId', 'mediaType', 'sortOrder'],
              properties: {
                fileId: { type: 'string', format: 'uuid', description: 'UUID of the file to attach.' },
                mediaType: {
                  type: 'string',
                  enum: ['image', 'video', 'audio'],
                  description: 'Media bucket for the file.',
                },
                sortOrder: { type: 'integer', minimum: 0, description: 'Display order within the template.' },
              },
            },
            description: 'Optional media items. Maximum 6 items.',
          },
        },
      },
      AddToStoryboardPayload: {
        type: 'object',
        required: ['draftId'],
        description: 'Request body for POST /scene-templates/:id/add-to-storyboard.',
        properties: {
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the target storyboard draft.' },
          positionX: {
            type: 'number',
            description: 'Optional canvas X position for the new block. Defaults to 400.',
          },
          positionY: {
            type: 'number',
            description: 'Optional canvas Y position for the new block. Defaults to 400.',
          },
        },
      },
    },
  },
} as const;
