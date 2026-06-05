/**
 * Inline OpenAPI 3.1 spec for the ClipTale API.
 *
 * This file is the single source of truth for the API contract.
 * The file is hand-maintained — no codegen script watches it — so updates to
 * the spec and any consumer types must land in the same commit.
 *
 * Routes documented here:
 *  - POST /files/stream-urls                    — bulk presigned file stream URLs
 *  - GET /projects                               — list authenticated user's projects (Home hub)
 *  - POST /projects                              — create project with optional title (Home hub)
 *  - PATCH /projects/{projectId}/clips/{clipId}  — partial clip update (Epic 6)
 *  - GET /assets                                 — global wizard-gallery listing
 *  - POST/GET/PUT/DELETE /generation-drafts      — video generation wizard drafts
 *  - GET /generation-drafts/cards                — storyboard card summaries (Home hub)
 *  - POST /generation-drafts/{id}/storyboard-plan — enqueue async storyboard planning
 *  - GET /generation-drafts/{id}/storyboard-plan/{jobId} — poll storyboard planning
 *  - POST /storyboards/{draftId}/initialize      — seed START/END sentinel blocks
 *  - POST /storyboards/{draftId}/apply-latest-plan — apply latest completed plan
 *  - POST /storyboards/{draftId}/project         — create editor project from ready storyboard
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
 *  - GET /users/me/settings                      — effective per-account settings (lazy row)
 *  - PUT /users/me/settings                      — upsert settings (interval preset whitelist)
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'ClipTale API',
    version: '1.0.0',
  },
  paths: {
    '/files/stream-urls': {
      post: {
        summary: 'Resolve presigned stream URLs for multiple files',
        description:
          'Returns short-lived stream/download URLs for authenticated user-owned, non-deleted files. ' +
          'Missing, foreign, and soft-deleted IDs are all reported in missingFileIds without detail.',
        operationId: 'createFileStreamUrls',
        tags: ['files'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateFileStreamUrlsBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Resolved URL map and unresolved file IDs.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FileStreamUrlsResponse' },
              },
            },
          },
          400: { description: 'Validation error.' },
          401: { description: 'Missing or invalid JWT.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
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
    '/generation-drafts/{id}/storyboard-plan': {
      post: {
        summary: 'Start asynchronous storyboard planning for a generation draft',
        description:
          'Validates the current draft PromptDoc, persists a queued storyboard planning job, ' +
          'and enqueues worker processing. The request returns immediately with HTTP 202; ' +
          'clients should poll the returned job ID.',
        operationId: 'startStoryboardPlan',
        tags: ['generation-drafts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft to plan.',
          },
        ],
        responses: {
          202: {
            description: 'Storyboard planning job queued.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StartStoryboardPlanResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'PromptDoc is invalid or has no text/media input to plan.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-drafts/{id}/storyboard-plan/{jobId}': {
      get: {
        summary: 'Poll a storyboard planning job',
        description:
          'Returns persisted storyboard planning status from MySQL. The completed response ' +
          'includes the durable storyboard plan; failed responses include a sanitized error.',
        operationId: 'getStoryboardPlanStatus',
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
            description: 'Storyboard planning job ID returned by POST /storyboard-plan.',
          },
        ],
        responses: {
          200: {
            description: 'Persisted storyboard planning job status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardPlanJobStatusResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid session token.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft or storyboard planning job not found.' },
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
    '/storyboards/{draftId}/apply-latest-plan': {
      post: {
        summary: 'Apply the latest completed storyboard plan',
        description:
          'Finds the latest completed storyboard planning job for the draft, replaces the ' +
          'storyboard with ordered START -> scene blocks -> END content, preserves referenced ' +
          'media on scene blocks, writes a history snapshot, and returns the authoritative state.',
        operationId: 'applyLatestStoryboardPlan',
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
            description: 'Storyboard plan applied. Returns the generated storyboard state.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardState' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'No completed storyboard plan exists for this draft.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/project': {
      post: {
        summary: 'Create an editor project from a ready storyboard',
        description:
          'Assembles approved storyboard scene illustrations into a new image-based editor project. ' +
          'The operation is idempotent for completed drafts: repeated calls return the existing projectId/versionId.',
        operationId: 'createProjectFromStoryboard',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the storyboard generation draft.',
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateStoryboardProjectBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Project created or existing completed project returned.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardProjectCreateResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Authenticated user does not own the storyboard draft.' },
          404: { description: 'Storyboard draft not found.' },
          422: {
            description:
              'Storyboard is not ready for project creation: missing scenes, unapproved principal image, or unfinished scene outputs.',
          },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/videos': {
      get: {
        summary: 'List storyboard scene video statuses',
        description:
          'Returns one Image-to-Video generation status item for every scene block in storyboard order.',
        operationId: 'listStoryboardVideos',
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
            description: 'Scene video generation statuses.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardVideoStatusResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'Storyboard has no scene blocks.' },
        },
        security: [{ bearerAuth: [] }],
      },
      post: {
        summary: 'Start storyboard scene video generation',
        description:
          'Enqueues one Image-to-Video AI generation job for each eligible scene block using the selected model, ' +
          'the scene videoPrompt, the ready scene illustration, optional next-scene end image, and optional native audio.',
        operationId: 'startStoryboardVideos',
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
              schema: { $ref: '#/components/schemas/StartStoryboardVideosBody' },
            },
          },
        },
        responses: {
          202: {
            description: 'Scene video generation jobs queued where needed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardVideoStatusResponse' },
              },
            },
          },
          400: { description: 'Invalid model selection or unsupported audio toggle.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: {
            description:
              'Storyboard is not ready for video generation: missing video prompts, unapproved principal image, or missing ready scene images.',
          },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/music': {
      get: {
        summary: 'List storyboard music blocks',
        description:
          'Returns every storyboard background music block with resolved existing-track or AI generation status.',
        operationId: 'listStoryboardMusic',
        tags: ['storyboard'],
        parameters: [{
          name: 'draftId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'UUID of the generation draft.',
        }],
        responses: {
          200: {
            description: 'Storyboard music blocks with resolved status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardMusicResponse' },
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
    '/storyboards/{draftId}/music/{musicBlockId}': {
      put: {
        summary: 'Update a storyboard music block',
        description:
          'Updates music source mode, prompt, composition plan, scene range, volume, fades, and loop mode.',
        operationId: 'updateStoryboardMusicBlock',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'musicBlockId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StoryboardMusicBlockUpdateBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated music block.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoryboardMusicBlock' } } },
          },
          400: { description: 'Invalid range or request body.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft or music block not found.' },
          422: { description: 'Existing file is not a ready audio file.' },
        },
        security: [{ bearerAuth: [] }],
      },
      patch: {
        summary: 'Patch a storyboard music block',
        description: 'Partially updates one storyboard music block.',
        operationId: 'patchStoryboardMusicBlock',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'musicBlockId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StoryboardMusicBlockUpdateBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated music block.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoryboardMusicBlock' } } },
          },
          400: { description: 'Invalid range or request body.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft or music block not found.' },
          422: { description: 'Existing file is not a ready audio file.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/music/{musicBlockId}/generate': {
      post: {
        summary: 'Generate one storyboard music block now',
        description:
          'Starts or retries one generate_now ElevenLabs music job without duplicating queued or running jobs.',
        operationId: 'generateStoryboardMusicBlock',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'musicBlockId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          202: {
            description: 'Music generation job queued or already active.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardMusicResponse' },
              },
            },
          },
          400: { description: 'Music block is not in generate_now mode.' },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft or music block not found.' },
          422: { description: 'Music block has no prompt or composition plan.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/music/generate-pending': {
      post: {
        summary: 'Generate pending storyboard music',
        description:
          'Starts unresolved generate_on_step3 ElevenLabs music blocks for Step 3 assembly.',
        operationId: 'generatePendingStoryboardMusic',
        tags: ['storyboard'],
        parameters: [{
          name: 'draftId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        }],
        responses: {
          202: {
            description: 'Pending music generation jobs queued where needed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardMusicResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'A pending music block has no prompt or composition plan.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/illustrations': {
      get: {
        summary: 'List storyboard illustration statuses',
        description:
          'Returns the canonical style reference status and one illustration status item for every scene block in storyboard order.',
        operationId: 'listStoryboardIllustrations',
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
            description: 'Scene illustration statuses.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' },
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
        summary: 'Start storyboard reference and scene illustrations',
        description:
          'Creates or retries the canonical style reference, then enqueues the next eligible ' +
          'missing or failed scene image-edit job without duplicating queued/running jobs. ' +
          'Returns quickly with current reference and scene queued/running/ready/failed states.',
        operationId: 'startStoryboardIllustrations',
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
          202: {
            description: 'Reference or scene illustration work queued where needed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'One or more selected scene blocks has no prompt.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/blocks/{blockId}/illustration': {
      post: {
        summary: 'Start or retry one storyboard scene illustration',
        description:
          'Creates or retries the canonical style reference if needed, then enqueues one scene ' +
          'image-edit job only when its reference and previous-scene prerequisites are ready. ' +
          'Failed scenes can be retried through this endpoint.',
        operationId: 'startStoryboardBlockIllustration',
        tags: ['storyboard'],
        parameters: [
          {
            name: 'draftId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the generation draft.',
          },
          {
            name: 'blockId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'UUID of the storyboard scene block.',
          },
        ],
        responses: {
          202: {
            description: 'Scene illustration job queued or active job returned.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft or scene block not found.' },
          422: { description: 'The selected scene block has no prompt.' },
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
        summary: 'Push a checkpoint history snapshot',
        description:
          'Inserts a new checkpoint history entry for the draft and prunes the table beyond ' +
          '50 rows (the cap is origin-agnostic — oldest entries are deleted regardless of ' +
          'origin). The server stamps origin=checkpoint on the inserted row — origin is not ' +
          'a request field. previewKind declares whether the snapshot carries an inline ' +
          'layout-screenshot data-URL (screenshot) or fell back to the SVG minimap after a ' +
          'capture failure / 5 s timeout (minimap). Returns 201 with the auto-assigned row id.',
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
    '/storyboards/{draftId}/illustrations/principal-image/approve': {
      post: {
        summary: 'Approve the active storyboard principal image',
        description:
          'Approves the ready canonical principal image for a draft. Scene illustration ' +
          'jobs remain blocked until this approval exists.',
        operationId: 'approveStoryboardPrincipalImage',
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
            description: 'Principal image approved. Returns current illustration status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' },
              },
            },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'No ready principal image exists for this storyboard.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/illustrations/principal-image/edit': {
      post: {
        summary: 'Regenerate the active storyboard principal image',
        description:
          'Starts a gpt-image-2 image-edit job from the current principal image plus optional extra references. Approval is cleared until the new image is approved.',
        operationId: 'editStoryboardPrincipalImage',
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
          content: { 'application/json': { schema: { $ref: '#/components/schemas/EditPrincipalImageBody' } } },
        },
        responses: {
          202: {
            description: 'Principal image edit queued.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' } } },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'No ready principal image exists, or reference files are invalid.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/illustrations/principal-image/replace': {
      post: {
        summary: 'Replace the active storyboard principal image',
        description:
          'Sets an existing ready draft-linked image file as the active principal image and clears approval.',
        operationId: 'replaceStoryboardPrincipalImage',
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
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReplacePrincipalImageBody' } } },
        },
        responses: {
          200: {
            description: 'Principal image replaced.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' } } },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'Replacement file is missing, not ready, not an image, or not linked to this draft.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/storyboards/{draftId}/illustrations/principal-image/references': {
      put: {
        summary: 'Set extra storyboard principal image references',
        description:
          'Replaces the extra draft-linked image references used for future principal image regeneration and clears approval.',
        operationId: 'setStoryboardPrincipalImageReferences',
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
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SetPrincipalImageReferencesBody' } } },
        },
        responses: {
          200: {
            description: 'Principal image references updated.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoryboardIllustrationStatusResponse' } } },
          },
          401: { description: 'Missing or invalid JWT.' },
          403: { description: 'Draft belongs to another user.' },
          404: { description: 'Draft not found.' },
          422: { description: 'One or more reference files are missing, not ready images, or not linked to this draft.' },
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
    // ── generate-ai-flow (T14: AC-04 / AC-08b / AC-10 / AC-19) ──────────────────
    '/generation-flows': {
      get: {
        summary: 'List my generation flows (owner-scoped, most-recent first)',
        description:
          'Flow 3 / AC-04. Returns only the calling Creator\'s non-deleted flows, ordered by ' +
          'updatedAt DESC. Summaries only — no canvas.',
        operationId: 'listGenerationFlows',
        tags: ['flows'],
        parameters: [
          {
            in: 'query',
            name: 'cursor',
            required: false,
            description: 'Opaque cursor — id of the last item seen; the page starts after it.',
            schema: { type: 'string' },
          },
          {
            in: 'query',
            name: 'limit',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 24 },
          },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlowSummaryPage' },
              },
            },
          },
          401: { description: 'Missing or invalid bearer token.' },
        },
        security: [{ bearerAuth: [] }],
      },
      post: {
        summary: 'Create a new (empty) generation flow',
        description: 'US-01 / Flow 3. Creates an owner-scoped flow at version 1 with an empty canvas.',
        operationId: 'createGenerationFlow',
        tags: ['flows'],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FlowCreate' },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Flow' },
              },
            },
          },
          400: { description: 'Malformed request body (Zod validation).' },
          401: { description: 'Missing or invalid bearer token.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-flows/{flowId}': {
      get: {
        summary: 'Open a flow — canvas + last-known per-block job states',
        description:
          'Flow 2 / Flow 3 / AC-10 / AC-08b. Returns the full canvas plus each result block\'s ' +
          'last-known generation job state. Non-owner → 404 (existence hiding, AC-04).',
        operationId: 'getGenerationFlow',
        tags: ['flows'],
        parameters: [
          {
            in: 'path',
            name: 'flowId',
            required: true,
            description: 'generation_flows.flow_id',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Flow' },
              },
            },
          },
          401: { description: 'Missing or invalid bearer token.' },
          404: { description: 'Flow does not exist or is not owned by the caller (existence hiding, AC-04).' },
        },
        security: [{ bearerAuth: [] }],
      },
      patch: {
        summary: 'Rename a flow',
        description: 'US-01 / Flow 3. Metadata-only update of the title.',
        operationId: 'renameGenerationFlow',
        tags: ['flows'],
        parameters: [
          {
            in: 'path',
            name: 'flowId',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FlowRename' },
            },
          },
        },
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlowSummary' },
              },
            },
          },
          400: { description: 'Malformed request body (Zod validation).' },
          401: { description: 'Missing or invalid bearer token.' },
          404: { description: 'Flow not found or not owned by caller.' },
        },
        security: [{ bearerAuth: [] }],
      },
      delete: {
        summary: 'Delete a flow (soft) — library assets preserved',
        description:
          'Flow 9 / AC-19. Soft-deletes the flow and its flow_files links; generated library ' +
          'assets are RESTRICTed and survive. Non-owner → 404. Idempotent.',
        operationId: 'deleteGenerationFlow',
        tags: ['flows'],
        parameters: [
          {
            in: 'path',
            name: 'flowId',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          204: { description: 'Deleted (no content).' },
          401: { description: 'Missing or invalid bearer token.' },
          404: { description: 'Flow not found or not owned by caller.' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-flows/{flowId}/canvas': {
      put: {
        summary: 'Autosave the flow canvas (optimistic-lock)',
        description:
          'Flow 4/5/6 / AC-10 / AC-10b / AC-15 / AC-16. Replaces the canvas document. ' +
          'The body carries the PARENT version; a mismatch → 409 (first save stays authoritative). ' +
          'On success the version is incremented and returned.',
        operationId: 'saveGenerationFlowCanvas',
        tags: ['flows'],
        parameters: [
          {
            in: 'path',
            name: 'flowId',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CanvasSave' },
            },
          },
        },
        responses: {
          200: {
            description: 'Saved',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CanvasSaveResult' },
              },
            },
          },
          400: { description: 'Malformed request body (Zod validation).' },
          401: { description: 'Missing or invalid bearer token.' },
          404: { description: 'Flow not found or not owned by caller.' },
          409: {
            description: 'Version conflict — the flow was saved elsewhere; reload before retrying (AC-10b).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: {
                  error: 'This flow was changed in another tab. Reload to continue.',
                  code: 'flow.version_conflict',
                },
              },
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-flows/{flowId}/blocks/{blockId}/estimate': {
      post: {
        summary: 'Pre-flight cost estimate for a generation block',
        description:
          'Flow 1 / ADR-0005. Reads the saved canvas, resolves the block model + inputs, and returns ' +
          'a BEST-EFFORT cost from the static per-model pricing table. Advisory only; non-mutating; no provider call.',
        operationId: 'estimateGenerationCost',
        tags: ['generate'],
        parameters: [
          { in: 'path', name: 'flowId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'blockId', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CostEstimate' },
              },
            },
          },
          401: { description: 'Missing or invalid bearer token.' },
          404: { description: 'Flow not found or not owned by caller (existence hiding).' },
          422: {
            description: 'The block is not a generation block in this canvas, or its model is unknown.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
              },
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/generation-flows/{flowId}/blocks/{blockId}/generate': {
      post: {
        summary: 'Server-authoritative Generate for one block (spend-bearing)',
        description:
          'Flow 1/7/8. The single spend path. The server re-validates ALL preconditions before any ' +
          'provider call (required inputs, exclusivity, referenced-asset presence, content validity, owner), ' +
          'then checks the per-Creator rate limit (≤ 30/min). On pass it creates the ai_generation_job ' +
          '(flow_id, block_id) and enqueues the ai-generate job, returning 202. ' +
          'Idempotency-Key is REQUIRED so a double-submit never double-charges; the server returns the first job on retry.',
        operationId: 'generateBlock',
        tags: ['generate'],
        parameters: [
          { in: 'path', name: 'flowId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'blockId', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            in: 'header',
            name: 'Idempotency-Key',
            required: true,
            description: 'client-generated UUID; the server returns the first run result on retry (TTL 24h).',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenerateRequest' },
            },
          },
        },
        responses: {
          202: {
            description: 'Accepted — job enqueued (proceeds asynchronously).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerateAccepted' },
              },
            },
          },
          400: { description: 'Malformed body, or the required Idempotency-Key header is missing.' },
          401: { description: 'Missing or invalid bearer token.' },
          404: {
            description:
              'Flow not found or not owned by caller, OR a reference to a never-owned asset (existence hiding, AC-04).',
          },
          409: {
            description: 'Stale flow version — reload before generating (AC-10b).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: {
                  error: 'This flow changed since you opened it. Reload before generating.',
                  code: 'flow.version_conflict',
                },
              },
            },
          },
          422: {
            description:
              'The gate blocked the run before any provider call. The code distinguishes the failure modes: ' +
              'flow.required_input_missing (AC-03), flow.exclusivity_violation (AC-06), ' +
              'flow.asset_missing (AC-05, previously-owned asset only), flow.content_invalid (AC-17).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: {
                  requiredInputMissing: {
                    value: {
                      error: 'Connect a text input before generating.',
                      code: 'flow.required_input_missing',
                      details: { blockId: '22222222-2222-4222-8222-222222222222', input: 'prompt' },
                    },
                  },
                  exclusivityViolation: {
                    value: {
                      error: 'Provide exactly one of: prompt, multiPrompt.',
                      code: 'flow.exclusivity_violation',
                      details: { exclusiveGroup: 'prompt_mode', provided: ['prompt', 'multiPrompt'] },
                    },
                  },
                  assetMissing: {
                    value: {
                      error: 'A library asset this block uses is missing. Replace it and try again.',
                      code: 'flow.asset_missing',
                      details: { blockId: '44444444-4444-4444-8444-444444444444' },
                    },
                  },
                  contentInvalid: {
                    value: {
                      error: 'The text content block is empty.',
                      code: 'flow.content_invalid',
                      details: { blockId: '44444444-4444-4444-8444-444444444444', reason: 'empty' },
                    },
                  },
                },
              },
            },
          },
          429: {
            description: 'Per-Creator generation rate limit exceeded (ADR-0004, ≤ 30/min). Try again shortly.',
            headers: {
              'Retry-After': {
                description: 'seconds until the window frees a slot',
                schema: { type: 'integer' },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: {
                  error: 'Too many generations. Try again in a moment.',
                  code: 'flow.rate_limited',
                  details: { limitPerMinute: 30 },
                },
              },
            },
          },
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
    '/users/me/settings': {
      get: {
        summary: 'Read my account settings (effective values, lazy row)',
        description:
          'Returns the effective per-account settings. Always 200 for an authenticated user: ' +
          'when no user_settings row exists yet (it is created lazily on first write), the ' +
          'response carries the app-layer defaults (autosaveIntervalSeconds: 60) with ' +
          'updatedAt: null. The setting follows the account, not the browser. Owner-scoping ' +
          'is structural: the path addresses only the authenticated account.',
        operationId: 'getMySettings',
        tags: ['settings'],
        responses: {
          200: {
            description: 'Effective settings (stored values, or defaults when no row exists yet).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserSettings' },
              },
            },
          },
          401: { description: 'Missing or invalid token.' },
        },
        security: [{ bearerAuth: [] }],
      },
      put: {
        summary: 'Update my account settings (lazy upsert, preset whitelist)',
        description:
          'Upserts the caller\'s single user_settings row (created lazily on first write). ' +
          'autosaveIntervalSeconds is validated against the preset whitelist 30/60/120/300/600 s ' +
          'by Zod — any other value is a 400. Naturally idempotent (single-row upsert).',
        operationId: 'updateMySettings',
        tags: ['settings'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserSettingsUpdate' },
            },
          },
        },
        responses: {
          200: {
            description: 'Stored — the persisted settings.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserSettings' },
              },
            },
          },
          400: { description: 'Interval not in the preset whitelist (Zod).' },
          401: { description: 'Missing or invalid token.' },
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
      AutosaveIntervalSeconds: {
        type: 'integer',
        enum: [30, 60, 120, 300, 600],
        default: 60,
        description:
          'user_settings.settings_json.autosaveIntervalSeconds — preset whitelist enforced ' +
          'by Zod in the app layer; presets 30 s / 1 / 2 / 5 / 10 min; default 1 min.',
      },
      UserSettings: {
        type: 'object',
        required: ['autosaveIntervalSeconds', 'updatedAt'],
        additionalProperties: false,
        properties: {
          autosaveIntervalSeconds: { $ref: '#/components/schemas/AutosaveIntervalSeconds' },
          updatedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            description:
              'user_settings.updated_at (DATETIME(3)); null = no row yet — the values shown ' +
              'are app-layer defaults.',
          },
        },
      },
      UserSettingsUpdate: {
        type: 'object',
        required: ['autosaveIntervalSeconds'],
        additionalProperties: false,
        properties: {
          autosaveIntervalSeconds: { $ref: '#/components/schemas/AutosaveIntervalSeconds' },
        },
      },
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
            $ref: '#/components/schemas/PromptDoc',
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
            $ref: '#/components/schemas/PromptDoc',
          },
        },
      },
      PromptDoc: {
        type: 'object',
        required: ['schemaVersion', 'blocks'],
        description:
          'PromptDoc block document persisted on generation drafts. Existing documents may omit settings.',
        properties: {
          schemaVersion: {
            type: 'integer',
            enum: [1],
            description: 'PromptDoc schema version. Must remain 1 for legacy compatibility.',
          },
          blocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/PromptBlock' },
          },
          settings: {
            $ref: '#/components/schemas/DraftSettings',
          },
        },
      },
      PromptBlock: {
        oneOf: [
          {
            type: 'object',
            required: ['type', 'value'],
            properties: {
              type: { type: 'string', enum: ['text'] },
              value: { type: 'string' },
            },
          },
          {
            type: 'object',
            required: ['type', 'mediaType', 'fileId', 'label'],
            properties: {
              type: { type: 'string', enum: ['media-ref'] },
              mediaType: { type: 'string', enum: ['video', 'image', 'audio'] },
              fileId: { type: 'string', format: 'uuid' },
              label: { type: 'string' },
            },
          },
        ],
        discriminator: {
          propertyName: 'type',
        },
      },
      DraftSettings: {
        type: 'object',
        required: ['videoLengthSeconds', 'aspectRatio', 'styleKey'],
        description:
          'Optional draft-level generation settings. Clients should use defaults when omitted: 30 seconds, 16:9, cinematic, modelPreference null.',
        properties: {
          videoLengthSeconds: {
            type: 'integer',
            minimum: 1,
            maximum: 600,
          },
          aspectRatio: {
            type: 'string',
            enum: ['16:9', '9:16', '1:1'],
          },
          styleKey: {
            type: 'string',
            enum: ['cinematic', 'documentary', 'social', 'product', 'minimal'],
          },
          modelPreference: {
            type: ['string', 'null'],
            description: 'Optional model preference for future storyboard planning. Defaults to null.',
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
            $ref: '#/components/schemas/PromptDoc',
            description:
              'Proposed PromptDoc produced by the LLM. Present only when status=done. ' +
              'Conforms to promptDocSchema.',
          },
          error: {
            type: 'string',
            description: 'Human-readable error message. Present only when status=failed.',
          },
        },
      },
      StartStoryboardPlanResponse: {
        type: 'object',
        required: ['jobId', 'status'],
        description: 'Returned by POST /generation-drafts/:id/storyboard-plan.',
        properties: {
          jobId: {
            type: 'string',
            format: 'uuid',
            description: 'Persisted storyboard planning job ID.',
          },
          status: {
            type: 'string',
            enum: ['queued', 'running'],
          },
        },
      },
      StoryboardPlanJobStatusResponse: {
        oneOf: [
          {
            type: 'object',
            required: ['jobId', 'status'],
            properties: {
              jobId: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['queued', 'running'] },
              plan: { type: 'null' },
              errorMessage: { type: 'null' },
            },
          },
          {
            type: 'object',
            required: ['jobId', 'status', 'plan'],
            properties: {
              jobId: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['completed'] },
              plan: { $ref: '#/components/schemas/StoryboardPlan' },
              errorMessage: { type: 'null' },
            },
          },
          {
            type: 'object',
            required: ['jobId', 'status', 'errorMessage'],
            properties: {
              jobId: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['failed'] },
              plan: { type: 'null' },
              errorMessage: { type: 'string' },
            },
          },
        ],
        discriminator: {
          propertyName: 'status',
        },
      },
      StoryboardPlan: {
        type: 'object',
        required: ['schemaVersion', 'videoLengthSeconds', 'sceneCount', 'scenes', 'musicSegments'],
        description: 'Structured storyboard instruction array persisted after planning.',
        properties: {
          schemaVersion: { type: 'integer', enum: [2] },
          videoLengthSeconds: { type: 'integer', minimum: 1, maximum: 600 },
          sceneCount: { type: 'integer', minimum: 1, maximum: 40 },
          scenes: {
            type: 'array',
            minItems: 1,
            maxItems: 40,
            items: { $ref: '#/components/schemas/StoryboardPlanScene' },
          },
          musicSegments: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardPlanMusicSegment' },
            description:
              'Planned background music segments. Scene ranges reference sceneNumber values during planning.',
          },
        },
      },
      StoryboardPlanScene: {
        type: 'object',
        required: [
          'sceneNumber',
          'prompt',
          'visualPrompt',
          'videoPrompt',
          'durationSeconds',
          'referencedMedia',
          'transitionNotes',
          'style',
        ],
        properties: {
          sceneNumber: { type: 'integer', minimum: 1 },
          prompt: { type: 'string', minLength: 1 },
          visualPrompt: { type: 'string', minLength: 1 },
          videoPrompt: {
            type: 'string',
            minLength: 1,
            description: 'Image-to-video motion prompt for animating the generated scene illustration.',
          },
          durationSeconds: { type: 'number', exclusiveMinimum: 0 },
          referencedMedia: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardPlanReferencedMedia' },
          },
          transitionNotes: { type: 'string' },
          style: {
            type: 'string',
            enum: ['cinematic', 'documentary', 'social', 'product', 'minimal'],
          },
        },
      },
      StoryboardPlanReferencedMedia: {
        type: 'object',
        required: ['fileId', 'mediaType', 'label'],
        properties: {
          fileId: { type: 'string', format: 'uuid' },
          mediaType: { type: 'string', enum: ['video', 'image', 'audio'] },
          label: { type: 'string', minLength: 1 },
        },
      },
      StoryboardPlanMusicSegment: {
        type: 'object',
        required: ['name', 'prompt', 'compositionPlan', 'startSceneNumber', 'endSceneNumber', 'sourceMode'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          prompt: { type: 'string', minLength: 1 },
          compositionPlan: { $ref: '#/components/schemas/ElevenLabsCompositionPlan' },
          startSceneNumber: { type: 'integer', minimum: 1 },
          endSceneNumber: { type: 'integer', minimum: 1 },
          sourceMode: {
            type: 'string',
            enum: ['existing', 'generate_now', 'generate_on_step3'],
            default: 'generate_on_step3',
          },
        },
      },
      ElevenLabsCompositionPlan: {
        type: 'object',
        required: ['positive_global_styles', 'negative_global_styles', 'sections'],
        description: 'ElevenLabs Music composition_plan payload. Use this instead of prompt for planned music.',
        properties: {
          positive_global_styles: {
            type: 'array',
            maxItems: 50,
            items: { type: 'string', minLength: 1, maxLength: 100 },
          },
          negative_global_styles: {
            type: 'array',
            maxItems: 50,
            items: { type: 'string', minLength: 1, maxLength: 100 },
          },
          sections: {
            type: 'array',
            minItems: 1,
            maxItems: 30,
            items: { $ref: '#/components/schemas/ElevenLabsCompositionPlanSection' },
          },
        },
      },
      ElevenLabsCompositionPlanSection: {
        type: 'object',
        required: ['section_name', 'positive_local_styles', 'negative_local_styles', 'duration_ms', 'lines'],
        properties: {
          section_name: { type: 'string', minLength: 1, maxLength: 100 },
          positive_local_styles: {
            type: 'array',
            maxItems: 50,
            items: { type: 'string', minLength: 1, maxLength: 100 },
          },
          negative_local_styles: {
            type: 'array',
            maxItems: 50,
            items: { type: 'string', minLength: 1, maxLength: 100 },
          },
          duration_ms: { type: 'integer', minimum: 3000, maximum: 120000 },
          lines: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', maxLength: 200 },
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
      CreateFileStreamUrlsBody: {
        type: 'object',
        required: ['fileIds'],
        additionalProperties: false,
        properties: {
          fileIds: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { type: 'string', format: 'uuid' },
            description: 'File IDs to resolve. The API deduplicates IDs before lookup.',
          },
        },
      },
      FileStreamUrlsResponse: {
        type: 'object',
        required: ['urls', 'missingFileIds'],
        properties: {
          urls: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of fileId to short-lived presigned stream/download URL.',
          },
          missingFileIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Requested IDs that were missing, foreign, or soft-deleted.',
          },
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
          'id', 'draftId', 'blockType', 'name', 'prompt', 'videoPrompt', 'durationS',
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
          prompt: { type: ['string', 'null'], description: 'Still-image generation prompt for this scene.' },
          videoPrompt: {
            type: ['string', 'null'],
            description: 'Optional Image-to-Video motion prompt for this scene.',
          },
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
      StoryboardMusicBlock: {
        type: 'object',
        required: [
          'id', 'draftId', 'name', 'sourceMode', 'prompt', 'compositionPlan', 'existingFileId',
          'startSceneBlockId', 'endSceneBlockId', 'positionX', 'positionY', 'sortOrder', 'volume',
          'fadeInS', 'fadeOutS', 'loopMode', 'generationStatus', 'generationJobId', 'outputFileId',
          'errorMessage', 'createdAt', 'updatedAt',
        ],
        description:
          'A storyboard background music block. Coverage is a logical scene range, not storyboard_edges.',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'UUID of the music block.' },
          draftId: { type: 'string', format: 'uuid', description: 'UUID of the owning draft.' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          sourceMode: { $ref: '#/components/schemas/StoryboardMusicSourceMode' },
          prompt: { type: ['string', 'null'] },
          compositionPlan: {
            oneOf: [{ $ref: '#/components/schemas/ElevenLabsCompositionPlan' }, { type: 'null' }],
          },
          existingFileId: { type: ['string', 'null'], format: 'uuid' },
          startSceneBlockId: { type: 'string', format: 'uuid' },
          endSceneBlockId: { type: 'string', format: 'uuid' },
          positionX: { type: 'number', description: 'Canvas X position in logical pixels.' },
          positionY: { type: 'number', description: 'Canvas Y position in logical pixels.' },
          sortOrder: { type: 'integer', minimum: 0 },
          volume: { type: 'number', minimum: 0, maximum: 1 },
          fadeInS: { type: 'number', minimum: 0 },
          fadeOutS: { type: 'number', minimum: 0 },
          loopMode: { type: 'string', enum: ['loop', 'trim'] },
          generationStatus: {
            type: ['string', 'null'],
            enum: ['queued', 'running', 'ready', 'failed', null],
          },
          generationJobId: { type: ['string', 'null'], format: 'uuid' },
          outputFileId: { type: ['string', 'null'], format: 'uuid' },
          errorMessage: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      StoryboardMusicSourceMode: {
        type: 'string',
        enum: ['existing', 'generate_now', 'generate_on_step3'],
        description: 'How a storyboard music block resolves its audio source.',
      },
      StoryboardMusicResponse: {
        type: 'object',
        required: ['items'],
        description: 'Storyboard background music blocks with resolved status.',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardMusicBlock' },
          },
        },
      },
      StoryboardMusicBlockUpdateBody: {
        type: 'object',
        additionalProperties: false,
        description: 'Partial update body for one storyboard music block.',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          sourceMode: { $ref: '#/components/schemas/StoryboardMusicSourceMode' },
          prompt: { type: ['string', 'null'] },
          compositionPlan: {
            oneOf: [{ $ref: '#/components/schemas/ElevenLabsCompositionPlan' }, { type: 'null' }],
          },
          existingFileId: { type: ['string', 'null'], format: 'uuid' },
          startSceneBlockId: { type: 'string', format: 'uuid' },
          endSceneBlockId: { type: 'string', format: 'uuid' },
          positionX: { type: 'number' },
          positionY: { type: 'number' },
          sortOrder: { type: 'integer', minimum: 0 },
          volume: { type: 'number', minimum: 0, maximum: 1 },
          fadeInS: { type: 'number', minimum: 0 },
          fadeOutS: { type: 'number', minimum: 0 },
          loopMode: { type: 'string', enum: ['loop', 'trim'] },
        },
      },
      StoryboardState: {
        type: 'object',
        required: ['blocks', 'edges', 'musicBlocks'],
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
          musicBlocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardMusicBlock' },
            description: 'All storyboard background music blocks for the draft.',
          },
        },
      },
      StoryboardProjectCreateResponse: {
        type: 'object',
        required: ['projectId', 'versionId'],
        description: 'Result returned after creating or reusing the editor project for a storyboard draft.',
        properties: {
          projectId: {
            type: 'string',
            format: 'uuid',
            description: 'Editor project id created from the storyboard.',
          },
          versionId: {
            type: 'integer',
            minimum: 1,
            description: 'Initial project_versions row id containing the assembled ProjectDoc.',
          },
        },
      },
      CreateStoryboardProjectBody: {
        type: 'object',
        additionalProperties: false,
        description:
          'Optional assembly mode for creating a project from storyboard outputs. Missing body defaults to image clips.',
        properties: {
          mode: {
            type: 'string',
            enum: ['images', 'videos'],
            default: 'images',
            description: 'Use ready scene illustrations or ready scene videos when assembling the timeline.',
          },
        },
      },
      StoryboardIllustrationStatusItem: {
        type: 'object',
        required: ['blockId', 'status', 'jobId', 'outputFileId', 'errorMessage'],
        description: 'Latest AI illustration generation status for one scene block.',
        properties: {
          blockId: { type: 'string', format: 'uuid', description: 'UUID of the scene block.' },
          status: {
            type: 'string',
            enum: ['queued', 'running', 'ready', 'failed'],
            description: 'UI-facing scene illustration state.',
          },
          jobId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Latest AI generation job id, or null before one has been created.',
          },
          outputFileId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Generated output file id when ready.',
          },
          errorMessage: {
            type: ['string', 'null'],
            description: 'Provider or validation error when failed.',
          },
        },
      },
      StoryboardIllustrationReferenceStatus: {
        type: 'object',
        required: [
          'status',
          'jobId',
          'outputFileId',
          'sourceReferenceFileIds',
          'approvalStatus',
          'errorMessage',
        ],
        description: 'Draft-level canonical style reference generation status.',
        properties: {
          status: {
            type: 'string',
            enum: ['queued', 'running', 'ready', 'failed'],
            description: 'UI-facing canonical reference state.',
          },
          jobId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Reference AI generation job id, or null before one has been created.',
          },
          outputFileId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Generated canonical reference output file id when ready.',
          },
          sourceReferenceFileIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'User-provided image reference file ids used to create the canonical reference.',
          },
          approvalStatus: {
            type: 'string',
            enum: ['pending', 'approved'],
            description: 'Whether the active principal image has been approved for scene generation.',
          },
          errorMessage: {
            type: ['string', 'null'],
            description: 'Provider or validation error when failed.',
          },
        },
      },
      StoryboardAutomationStatus: {
        type: 'object',
        required: ['phase', 'planningJobId', 'errorMessage'],
        description: 'Step 2 automation phase derived by the backend.',
        properties: {
          phase: {
            type: 'string',
            enum: [
              'idle',
              'planning',
              'creating_principal_image',
              'awaiting_principal_approval',
              'generating_scene_illustrations',
              'ready',
              'failed',
            ],
            description: 'Current Step 2 automation phase.',
          },
          planningJobId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Latest storyboard planning job id when one exists.',
          },
          errorMessage: {
            type: ['string', 'null'],
            description: 'Retryable planning, principal image, or scene illustration failure.',
          },
        },
      },
      StoryboardIllustrationStatusResponse: {
        type: 'object',
        required: ['automation', 'reference', 'items'],
        description:
          'Backend-derived automation phase plus canonical reference and per-scene illustration statuses ordered by storyboard order.',
        properties: {
          automation: { $ref: '#/components/schemas/StoryboardAutomationStatus' },
          reference: { $ref: '#/components/schemas/StoryboardIllustrationReferenceStatus' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardIllustrationStatusItem' },
          },
        },
        example: {
          automation: {
            phase: 'creating_principal_image',
            planningJobId: '33333333-3333-4333-8333-333333333333',
            errorMessage: null,
          },
          reference: {
            status: 'running',
            jobId: '11111111-1111-4111-8111-111111111111',
            outputFileId: null,
            sourceReferenceFileIds: [],
            approvalStatus: 'pending',
            errorMessage: null,
          },
          items: [
            {
              blockId: '22222222-2222-4222-8222-222222222222',
              status: 'queued',
              jobId: null,
              outputFileId: null,
              errorMessage: null,
            },
          ],
        },
      },
      StartStoryboardVideosBody: {
        type: 'object',
        required: ['modelId'],
        additionalProperties: false,
        description: 'Request body for starting storyboard Image-to-Video generation.',
        properties: {
          modelId: {
            type: 'string',
            description: 'AI model id from GET /ai/models with capability image_to_video.',
          },
          generateAudio: {
            type: 'boolean',
            default: false,
            description: 'Whether to request native audio when the selected model supports it.',
          },
        },
      },
      StoryboardVideoStatusItem: {
        type: 'object',
        required: [
          'blockId',
          'status',
          'jobId',
          'modelId',
          'generateAudio',
          'outputFileId',
          'errorMessage',
        ],
        description: 'Latest AI Image-to-Video generation status for one scene block.',
        properties: {
          blockId: { type: 'string', format: 'uuid', description: 'UUID of the scene block.' },
          status: {
            type: 'string',
            enum: ['queued', 'running', 'ready', 'failed'],
            description: 'UI-facing scene video generation state.',
          },
          jobId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Latest AI generation job id, or null before one has been created.',
          },
          modelId: {
            type: ['string', 'null'],
            description: 'Image-to-Video model id used by the latest job, or null before one exists.',
          },
          generateAudio: {
            type: 'boolean',
            description: 'Whether the latest job requested provider-native audio generation.',
          },
          outputFileId: {
            type: ['string', 'null'],
            format: 'uuid',
            description: 'Generated video output file id when ready.',
          },
          errorMessage: {
            type: ['string', 'null'],
            description: 'Provider or validation error when failed.',
          },
        },
      },
      StoryboardVideoStatusResponse: {
        type: 'object',
        required: ['items'],
        description: 'Per-scene storyboard Image-to-Video generation statuses ordered by storyboard order.',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoryboardVideoStatusItem' },
          },
        },
      },
      EditPrincipalImageBody: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            minLength: 1,
            maxLength: 4000,
            description: 'User instruction describing how to change the active principal image.',
          },
          extraReferenceFileIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Additional ready draft-linked image files to use for this regeneration.',
          },
        },
      },
      ReplacePrincipalImageBody: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', format: 'uuid' },
        },
      },
      SetPrincipalImageReferencesBody: {
        type: 'object',
        required: ['fileIds'],
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Ready draft-linked image files to store as extra principal-image references.',
          },
        },
      },
      BlockInsert: {
        type: 'object',
        required: [
          'id', 'draftId', 'blockType', 'name', 'prompt', 'videoPrompt', 'durationS',
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
          prompt: { type: ['string', 'null'], description: 'Still-image generation prompt.' },
          videoPrompt: {
            type: ['string', 'null'],
            description: 'Optional Image-to-Video motion prompt.',
          },
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
      MusicBlockInsert: {
        type: 'object',
        required: [
          'id', 'draftId', 'name', 'sourceMode', 'prompt', 'compositionPlan', 'existingFileId',
          'startSceneBlockId', 'endSceneBlockId', 'positionX', 'positionY', 'sortOrder',
          'volume', 'fadeInS', 'fadeOutS', 'loopMode',
        ],
        description: 'A storyboard music block in the PUT /storyboards/:draftId request body.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          draftId: { type: 'string', format: 'uuid' },
          name: { type: 'string', maxLength: 255 },
          sourceMode: { $ref: '#/components/schemas/StoryboardMusicSourceMode' },
          prompt: { type: ['string', 'null'] },
          compositionPlan: {
            oneOf: [{ $ref: '#/components/schemas/ElevenLabsCompositionPlan' }, { type: 'null' }],
          },
          existingFileId: { type: ['string', 'null'], format: 'uuid' },
          startSceneBlockId: { type: 'string', format: 'uuid' },
          endSceneBlockId: { type: 'string', format: 'uuid' },
          positionX: { type: 'number' },
          positionY: { type: 'number' },
          sortOrder: { type: 'integer', minimum: 0 },
          volume: { type: 'number', minimum: 0, maximum: 1 },
          fadeInS: { type: 'number', minimum: 0 },
          fadeOutS: { type: 'number', minimum: 0 },
          loopMode: { type: 'string', enum: ['loop', 'trim'] },
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
          musicBlocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/MusicBlockInsert' },
            description:
              'Optional complete set of music blocks. Omit to preserve existing music blocks.',
          },
        },
      },
      PushHistoryBody: {
        type: 'object',
        required: ['snapshot', 'previewKind'],
        description:
          'Request body for POST /storyboards/:draftId/history (checkpoint push). ' +
          'origin is deliberately NOT a request field — the server stamps origin=checkpoint.',
        properties: {
          snapshot: {
            type: 'object',
            description:
              'Opaque storyboard snapshot. Typically a StoryboardState-compatible object ' +
              '(plus an inline screenshot data-URL when previewKind=screenshot); ' +
              'the server stores it as-is without schema validation.',
          },
          previewKind: { $ref: '#/components/schemas/PreviewKind' },
        },
      },
      PreviewKind: {
        type: 'string',
        enum: ['screenshot', 'minimap'],
        description:
          'storyboard_history.preview_kind — screenshot = real layout capture; ' +
          'minimap = SVG-minimap fallback after capture failure / 5 s timeout.',
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

      // ── generate-ai-flow schemas (T14: AC-04 / AC-08b / AC-10 / AC-19) ─────
      /**
       * Unified error envelope — the repo's existing free-text `error` (required) PLUS
       * optional machine-readable `code` + `details` (team decision 2026-06-03).
       * Existing clients that only read `error` are unaffected.
       */
      ApiError: {
        type: 'object',
        required: ['error'],
        additionalProperties: false,
        properties: {
          error: { type: 'string', description: 'Human-readable message (existing repo field).' },
          code: {
            type: 'string',
            description: 'Machine-readable code, neutral module.error_name convention.',
            example: 'flow.version_conflict',
          },
          details: {
            type: 'object',
            description: 'Optional structured context.',
            additionalProperties: true,
          },
        },
      },
      FlowSummary: {
        type: 'object',
        required: ['flowId', 'title', 'version', 'createdAt', 'updatedAt'],
        additionalProperties: false,
        properties: {
          flowId: { type: 'string', format: 'uuid', description: 'generation_flows.flow_id' },
          title: { type: 'string', maxLength: 255, description: 'generation_flows.title' },
          version: { type: 'integer', minimum: 1, description: 'generation_flows.version (optimistic lock)' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      FlowSummaryPage: {
        type: 'object',
        required: ['items', 'nextCursor'],
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/FlowSummary' },
          },
          nextCursor: {
            type: ['string', 'null'],
            description: 'Opaque cursor for the next page, or null when there are no more.',
          },
        },
      },
      JobState: {
        description: "One result block's last-known job state, embedded in a flow read (reattach, AC-08b).",
        type: 'object',
        required: ['jobId', 'blockId', 'status', 'progress'],
        additionalProperties: false,
        properties: {
          jobId: { type: 'string', description: 'ai_generation_jobs.job_id' },
          blockId: { type: ['string', 'null'], format: 'uuid', description: 'ai_generation_jobs.block_id' },
          status: {
            type: 'string',
            enum: ['queued', 'processing', 'completed', 'failed'],
            description: "Repo's AiJobStatus.",
          },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          outputFileId: { type: ['string', 'null'], format: 'uuid' },
          resultUrl: { type: ['string', 'null'] },
          errorMessage: { type: ['string', 'null'] },
        },
      },
      Flow: {
        description: 'A full flow read — summary fields + the canvas document + per-block job states.',
        type: 'object',
        required: ['flowId', 'title', 'version', 'canvas', 'jobs', 'createdAt', 'updatedAt'],
        additionalProperties: false,
        properties: {
          flowId: { type: 'string', format: 'uuid' },
          title: { type: 'string', maxLength: 255 },
          version: { type: 'integer', minimum: 1 },
          canvas: {
            type: 'object',
            description: 'The whole node graph as an opaque JSON document (generation_flows.canvas, ADR-0002).',
            additionalProperties: true,
          },
          jobs: {
            type: 'array',
            description: "Last-known generation job state per result block, for restore + reattach (AC-08b).",
            items: { $ref: '#/components/schemas/JobState' },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      FlowCreate: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: {
            type: 'string',
            maxLength: 255,
            description: "Optional; defaults to 'Untitled flow'.",
          },
        },
      },
      FlowRename: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 255 },
        },
      },
      CanvasSave: {
        type: 'object',
        required: ['version', 'canvas'],
        additionalProperties: false,
        properties: {
          version: {
            type: 'integer',
            minimum: 1,
            description: 'The PARENT version this save is based on; a mismatch → 409 (AC-10b).',
          },
          canvas: {
            type: 'object',
            description: 'The full new canvas document.',
            additionalProperties: true,
          },
        },
      },
      CanvasSaveResult: {
        type: 'object',
        required: ['flowId', 'version', 'updatedAt'],
        additionalProperties: false,
        properties: {
          flowId: { type: 'string', format: 'uuid' },
          version: { type: 'integer', minimum: 1, description: 'The NEW, incremented version.' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Money: {
        type: 'object',
        required: ['currency', 'amount'],
        additionalProperties: false,
        properties: {
          currency: { type: 'string', description: 'ISO 4217 code, e.g. USD.' },
          amount: { type: 'number', minimum: 0, description: "Cost in the currency's major unit." },
        },
      },
      CostEstimate: {
        type: 'object',
        required: ['flowId', 'blockId', 'modelId', 'estimate', 'bestEffort'],
        additionalProperties: false,
        properties: {
          flowId: { type: 'string', format: 'uuid' },
          blockId: { type: 'string', format: 'uuid', description: 'canvas generation-block id' },
          modelId: { type: 'string', maxLength: 128, description: 'catalog model id' },
          estimate: { $ref: '#/components/schemas/Money' },
          bestEffort: {
            type: 'boolean',
            description: 'always true — static-table estimate (ADR-0005), reconciled against actuals out of band.',
          },
        },
      },
      GenerateRequest: {
        type: 'object',
        required: ['version'],
        additionalProperties: false,
        properties: {
          version: {
            type: 'integer',
            minimum: 1,
            description: 'The flow version the Creator generated against; stale → 409 (AC-10b).',
          },
          acknowledgedCost: {
            $ref: '#/components/schemas/Money',
          },
        },
      },
      GenerateAccepted: {
        type: 'object',
        required: ['jobId', 'blockId', 'status'],
        additionalProperties: false,
        properties: {
          jobId: { type: 'string', description: 'ai_generation_jobs.job_id' },
          blockId: { type: 'string', format: 'uuid', description: "ai_generation_jobs.block_id (result block source)" },
          status: { type: 'string', enum: ['queued'] },
        },
      },
    },
  },
} as const;
