import { randomUUID } from "node:crypto";

import { test, expect, type Page, type Route } from "@playwright/test";

import { installCorsWorkaround } from "./helpers/cors-workaround";
import { E2E_API_URL } from "./helpers/env";
import {
  cleanupDraft,
  createE2eDbConnection,
  createTempDraft,
  deleteStoryboardPlanJob,
  initializeDraft,
  readAuthenticatedUserId,
  readBearerToken,
  seedCompletedStoryboardPlanJob,
  waitForCanvas,
  type StoryboardPlanSeed,
} from "./helpers/storyboard";

const PLAN: StoryboardPlanSeed = {
  schemaVersion: 1,
  videoLengthSeconds: 18,
  sceneCount: 3,
  scenes: [
    {
      sceneNumber: 1,
      prompt: "Open on the creator setting up the workstation.",
      visualPrompt: "Wide cinematic desk shot with laptop, notes, and soft window light.",
      durationSeconds: 4,
      referencedMedia: [],
      transitionNotes: "Cut on hand movement.",
      style: "cinematic",
    },
    {
      sceneNumber: 2,
      prompt: "Show the product workflow in motion.",
      visualPrompt: "Close-up interface montage with cursor motion and layered panels.",
      durationSeconds: 4,
      referencedMedia: [],
      transitionNotes: "Match cut to the timeline.",
      style: "cinematic",
    },
    {
      sceneNumber: 3,
      prompt: "End on the finished video preview.",
      visualPrompt: "Polished preview window with a confident creator reviewing the render.",
      durationSeconds: 4,
      referencedMedia: [],
      transitionNotes: "Fade out after the preview settles.",
      style: "cinematic",
    },
  ],
};

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwV0WQAAAABJRU5ErkJggg==",
  "base64",
);

type StoryboardBlock = {
  id: string;
  draftId: string;
  blockType: "start" | "end" | "scene";
  name: string | null;
  prompt: string | null;
  durationS: number;
  positionX: number;
  positionY: number;
  sortOrder: number;
  style: string | null;
  createdAt: string;
  updatedAt: string;
  mediaItems?: Array<{
    id: string;
    fileId: string;
    mediaType: "image";
    sortOrder: number;
  }>;
};

type StoryboardState = {
  blocks: StoryboardBlock[];
  edges: Array<{
    id: string;
    draftId: string;
    sourceBlockId: string;
    targetBlockId: string;
  }>;
};

type IllustrationStatus = "queued" | "running" | "ready" | "failed";

type IllustrationItem = {
  blockId: string;
  status: IllustrationStatus;
  jobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
};

type ReferenceStatusItem = {
  status: IllustrationStatus;
  jobId: string | null;
  outputFileId: string | null;
  sourceReferenceFileIds: string[];
  approvalStatus: "pending" | "approved";
  errorMessage: string | null;
};

type IllustrationStatusResponse = {
  reference: ReferenceStatusItem;
  items: IllustrationItem[];
};

async function seedDraftImageReferences(params: {
  conn: Awaited<ReturnType<typeof createE2eDbConnection>>;
  draftId: string;
  userId: string;
}): Promise<string[]> {
  const fileIds = [randomUUID(), randomUUID()];
  for (const [index, fileId] of fileIds.entries()) {
    await params.conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, width, height, display_name, status)
       VALUES (?, ?, 'image', ?, 'image/png', 128, 1, 1, ?, 'ready')`,
      [
        fileId,
        params.userId,
        `s3://e2e-storyboard/${fileId}.png`,
        `Style reference ${index + 1}`,
      ],
    );
    await params.conn.execute(
      `INSERT INTO draft_files (draft_id, file_id) VALUES (?, ?)`,
      [params.draftId, fileId],
    );
  }

  await params.conn.execute(
    `UPDATE generation_drafts SET prompt_doc = ? WHERE id = ?`,
    [
      JSON.stringify({
        schemaVersion: 1,
        blocks: [
          { type: "text", value: "Build a consistent storyboard from these visual references." },
          { type: "media-ref", mediaType: "image", fileId: fileIds[0], label: "Style reference 1" },
          { type: "media-ref", mediaType: "image", fileId: fileIds[1], label: "Style reference 2" },
        ],
      }),
      params.draftId,
    ],
  );

  return fileIds;
}

async function cleanupDraftImageReferences(
  conn: Awaited<ReturnType<typeof createE2eDbConnection>>,
  fileIds: string[],
): Promise<void> {
  if (fileIds.length === 0) return;
  const placeholders = fileIds.map(() => "?").join(",");
  await conn.query(`DELETE FROM draft_files WHERE file_id IN (${placeholders})`, fileIds);
  await conn.query(`DELETE FROM files WHERE file_id IN (${placeholders})`, fileIds);
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
    },
    body: JSON.stringify(body),
  };
}

function readyFileId(blockId: string): string {
  return `file-${blockId.slice(-12)}`;
}

function referenceFileId(sourceReferenceFileIds: string[] = []): string {
  return sourceReferenceFileIds.length > 1
    ? `file-canonical-reference-merged-${sourceReferenceFileIds.length}`
    : "file-canonical-reference";
}

function buildAppliedStoryboardState(draftId: string): StoryboardState {
  const now = new Date().toISOString();
  const startId = "00000000-0000-4000-8000-000000000101";
  const scene1Id = "00000000-0000-4000-8000-000000000201";
  const scene2Id = "00000000-0000-4000-8000-000000000202";
  const scene3Id = "00000000-0000-4000-8000-000000000203";
  const endId = "00000000-0000-4000-8000-000000000301";
  const blocks: StoryboardBlock[] = [
    {
      id: startId,
      draftId,
      blockType: "start",
      name: null,
      prompt: null,
      durationS: 0,
      positionX: 60,
      positionY: 200,
      sortOrder: 0,
      style: null,
      createdAt: now,
      updatedAt: now,
      mediaItems: [],
    },
    ...PLAN.scenes.map((scene, index) => ({
      id: [scene1Id, scene2Id, scene3Id][index]!,
      draftId,
      blockType: "scene" as const,
      name: `Scene ${String(scene.sceneNumber).padStart(2, "0")}`,
      prompt: scene.visualPrompt,
      durationS: scene.durationSeconds,
      positionX: 60 + (index + 1) * 280,
      positionY: 200,
      sortOrder: index + 1,
      style: scene.style,
      createdAt: now,
      updatedAt: now,
      mediaItems: [],
    })),
    {
      id: endId,
      draftId,
      blockType: "end",
      name: null,
      prompt: null,
      durationS: 0,
      positionX: 60 + 4 * 280,
      positionY: 200,
      sortOrder: 4,
      style: null,
      createdAt: now,
      updatedAt: now,
      mediaItems: [],
    },
  ];
  return {
    blocks,
    edges: [
      [startId, scene1Id],
      [scene1Id, scene2Id],
      [scene2Id, scene3Id],
      [scene3Id, endId],
    ].map(([sourceBlockId, targetBlockId], index) => ({
      id: `00000000-0000-4000-8000-00000000040${index}`,
      draftId,
      sourceBlockId: sourceBlockId!,
      targetBlockId: targetBlockId!,
    })),
  };
}

function buildItems(
  sceneBlockIds: string[],
  overrides: Map<string, IllustrationStatus>,
  options: { queuedJobIds?: boolean } = {},
): IllustrationItem[] {
  return sceneBlockIds.map((blockId, index) => {
    const status = overrides.get(blockId) ?? "queued";
    const jobId = status === "queued" && options.queuedJobIds !== true
      ? null
      : `job-${index + 1}`;
    return {
      blockId,
      status,
      jobId,
      outputFileId: status === "ready" ? readyFileId(blockId) : null,
      errorMessage: status === "failed" ? "Provider rejected this scene." : null,
    };
  });
}

function buildReference(
  overrides: Partial<ReferenceStatusItem> = {},
): ReferenceStatusItem {
  return {
    status: "queued",
    jobId: null,
    outputFileId: null,
    sourceReferenceFileIds: [],
    approvalStatus: "pending",
    errorMessage: null,
    ...overrides,
  };
}

function buildIllustrationResponse(params: {
  reference: ReferenceStatusItem;
  items: IllustrationItem[];
}): IllustrationStatusResponse {
  return {
    reference: params.reference,
    items: params.items,
  };
}

function withReadyMedia(state: StoryboardState, readyBlockIds: Set<string>): StoryboardState {
  return {
    ...state,
    blocks: state.blocks.map((block) => {
      if (block.blockType !== "scene" || !readyBlockIds.has(block.id)) return block;
      const fileId = readyFileId(block.id);
      return {
        ...block,
        mediaItems: [
          ...(block.mediaItems ?? []),
          {
            id: `media-${block.id}`,
            fileId,
            mediaType: "image",
            sortOrder: block.mediaItems?.length ?? 0,
          },
        ],
      };
    }),
  };
}

async function installStoryboardIllustrationMocks(
  page: Page,
  params: {
    token: string;
    draftId: string;
    planJobId: string;
    onIllustrationsRunning: () => void;
    sourceReferenceFileIds?: string[];
  },
): Promise<{
  completeReference: () => void;
  completeInitialRun: () => void;
  completeRetry: () => void;
  failReference: () => void;
  recoverReference: () => void;
  getSceneStartCount: () => number;
}> {
  let latestStoryboardState: StoryboardState | null = null;
  let sceneBlockIds: string[] = [];
  let startCount = 0;
  let retryStarted = false;
  let referenceStarted = false;
  let referenceComplete = false;
  let referenceApproved = false;
  let referenceFailed = false;
  let replacementFileId: string | null = null;
  let initialRunComplete = false;
  let retryComplete = false;
  const readyBlockIds = new Set<string>();
  const failedBlockIds = new Set<string>();
  let sourceReferenceFileIds = [...(params.sourceReferenceFileIds ?? [])];

  const currentReference = (): ReferenceStatusItem => {
    if (referenceFailed) {
      return buildReference({
        status: "failed",
        jobId: "ref-job-1",
        sourceReferenceFileIds,
        errorMessage: "Reference generation failed.",
      });
    }
    if (referenceComplete) {
      return buildReference({
        status: "ready",
        jobId: "ref-job-1",
        outputFileId: replacementFileId ?? referenceFileId(sourceReferenceFileIds),
        sourceReferenceFileIds,
        approvalStatus: referenceApproved ? "approved" : "pending",
      });
    }
    if (referenceStarted) {
      return buildReference({
        status: "running",
        jobId: "ref-job-1",
        sourceReferenceFileIds,
      });
    }
    return buildReference({ sourceReferenceFileIds });
  };

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      request.method() === "GET" &&
      path.includes("/assets/") &&
      (path.endsWith("/thumbnail") || path.endsWith("/stream"))
    ) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: PNG_1X1,
      });
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/generation-drafts/${params.draftId}/storyboard-plan`
    ) {
      await route.fulfill(jsonResponse({ jobId: params.planJobId, status: "queued" }, 202));
      return;
    }

    if (
      request.method() === "GET" &&
      path === `/generation-drafts/${params.draftId}/storyboard-plan/${params.planJobId}`
    ) {
      await route.fulfill(
        jsonResponse({
          jobId: params.planJobId,
          status: "completed",
          plan: PLAN,
          errorMessage: null,
        }),
      );
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/apply-latest-plan`
    ) {
      const state = buildAppliedStoryboardState(params.draftId);
      latestStoryboardState = state;
      sceneBlockIds = state.blocks
        .filter((block) => block.blockType === "scene")
        .map((block) => block.id);
      await route.fulfill(jsonResponse(state));
      return;
    }

    if (
      request.method() === "GET" &&
      path === `/storyboards/${params.draftId}` &&
      latestStoryboardState
    ) {
      await route.fulfill(jsonResponse(withReadyMedia(latestStoryboardState, readyBlockIds)));
      return;
    }

    if (
      request.method() === "GET" &&
      path === `/storyboards/${params.draftId}/illustrations`
    ) {
      if (sceneBlockIds.length === 0) {
        await route.fulfill(jsonResponse(buildIllustrationResponse({
          reference: currentReference(),
          items: [],
        })));
        return;
      }

      if (retryStarted && retryComplete) {
        failedBlockIds.clear();
        readyBlockIds.add(sceneBlockIds[1]!);
      } else if ((!referenceComplete || !referenceApproved) && !referenceFailed) {
        params.onIllustrationsRunning();
        await route.fulfill(
          jsonResponse(buildIllustrationResponse({
            reference: currentReference(),
            items: buildItems(sceneBlockIds, new Map()),
          })),
        );
        return;
      } else if (retryStarted) {
        params.onIllustrationsRunning();
        await route.fulfill(
          jsonResponse(buildIllustrationResponse({
            reference: currentReference(),
            items: buildItems(sceneBlockIds, new Map([
              [sceneBlockIds[0]!, "ready"],
              [sceneBlockIds[1]!, "running"],
              [sceneBlockIds[2]!, "ready"],
            ])),
          })),
        );
        return;
      } else if (initialRunComplete) {
        readyBlockIds.add(sceneBlockIds[0]!);
        readyBlockIds.add(sceneBlockIds[2]!);
        failedBlockIds.add(sceneBlockIds[1]!);
      } else if (startCount > 0) {
        params.onIllustrationsRunning();
        await route.fulfill(
          jsonResponse(buildIllustrationResponse({
            reference: currentReference(),
            items: buildItems(sceneBlockIds, new Map(sceneBlockIds.map((id) => [id, "running"]))),
          })),
        );
        return;
      }

      await route.fulfill(
        jsonResponse(buildIllustrationResponse({
          reference: currentReference(),
          items: buildItems(sceneBlockIds, new Map([
            ...Array.from(readyBlockIds).map((id) => [id, "ready"] as const),
            ...Array.from(failedBlockIds).map((id) => [id, "failed"] as const),
          ])),
        })),
      );
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/illustrations`
    ) {
      if (!referenceComplete || !referenceApproved) {
        referenceStarted = true;
        referenceFailed = false;
        await route.fulfill(
          jsonResponse(buildIllustrationResponse({
            reference: currentReference(),
            items: buildItems(sceneBlockIds, new Map()),
          }), 202),
        );
        return;
      }

      startCount += 1;
      await route.fulfill(
        jsonResponse(buildIllustrationResponse({
          reference: currentReference(),
          items: buildItems(
            sceneBlockIds,
            new Map(sceneBlockIds.map((id) => [id, "queued"])),
            { queuedJobIds: true },
          ),
        }), 202),
      );
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/illustrations/principal-image/approve`
    ) {
      referenceStarted = true;
      referenceComplete = true;
      referenceApproved = true;
      referenceFailed = false;
      await route.fulfill(jsonResponse(buildIllustrationResponse({
        reference: currentReference(),
        items: buildItems(sceneBlockIds, new Map()),
      })));
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/illustrations/principal-image/edit`
    ) {
      const body = request.postDataJSON() as { extraReferenceFileIds?: string[] } | null;
      sourceReferenceFileIds = [...new Set(body?.extraReferenceFileIds ?? sourceReferenceFileIds)];
      referenceStarted = true;
      referenceComplete = false;
      referenceApproved = false;
      referenceFailed = false;
      replacementFileId = null;
      await route.fulfill(
        jsonResponse(buildIllustrationResponse({
          reference: currentReference(),
          items: buildItems(sceneBlockIds, new Map()),
        }), 202),
      );
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/illustrations/principal-image/replace`
    ) {
      const body = request.postDataJSON() as { fileId?: string } | null;
      replacementFileId = body?.fileId ?? null;
      referenceStarted = true;
      referenceComplete = true;
      referenceApproved = false;
      referenceFailed = false;
      await route.fulfill(jsonResponse(buildIllustrationResponse({
        reference: currentReference(),
        items: buildItems(sceneBlockIds, new Map()),
      })));
      return;
    }

    if (
      request.method() === "PUT" &&
      path === `/storyboards/${params.draftId}/illustrations/principal-image/references`
    ) {
      const body = request.postDataJSON() as { fileIds?: string[] } | null;
      sourceReferenceFileIds = [...new Set(body?.fileIds ?? [])];
      referenceApproved = false;
      await route.fulfill(jsonResponse(buildIllustrationResponse({
        reference: currentReference(),
        items: buildItems(sceneBlockIds, new Map()),
      })));
      return;
    }

    if (
      request.method() === "POST" &&
      path.startsWith(`/storyboards/${params.draftId}/blocks/`) &&
      path.endsWith("/illustration")
    ) {
      retryStarted = true;
      failedBlockIds.clear();
      await route.fulfill(
        jsonResponse(buildIllustrationResponse({
          reference: currentReference(),
          items: buildItems(
            sceneBlockIds,
            new Map([
              [sceneBlockIds[0]!, "ready"],
              [sceneBlockIds[1]!, "queued"],
              [sceneBlockIds[2]!, "ready"],
            ]),
            { queuedJobIds: true },
          ),
        }), 202),
      );
      return;
    }

    if (url.origin === "http://localhost:3001") {
      const proxyRes = await page.request.fetch(`${E2E_API_URL}${path}${url.search}`, {
        method: request.method(),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.token}`,
        },
        data: request.postDataBuffer() ?? undefined,
      });
      await route.fulfill({
        status: proxyRes.status(),
        headers: {
          ...proxyRes.headers(),
          "access-control-allow-origin": "*",
          "access-control-allow-credentials": "true",
        },
        body: await proxyRes.body(),
      });
      return;
    }

    await route.fallback();
  });

  return {
    completeReference: () => {
      referenceStarted = true;
      referenceComplete = true;
      referenceApproved = false;
      referenceFailed = false;
    },
    completeInitialRun: () => {
      initialRunComplete = true;
    },
    completeRetry: () => {
      retryComplete = true;
    },
    failReference: () => {
      referenceStarted = true;
      referenceComplete = false;
      referenceFailed = true;
    },
    recoverReference: () => {
      referenceStarted = true;
      referenceComplete = true;
      referenceApproved = false;
      referenceFailed = false;
    },
    getSceneStartCount: () => startCount,
  };
}

test.describe("Storyboard Step 2 scene illustrations", () => {
  test.setTimeout(90_000);

  test("shows illustration status, retry, thumbnails, and Step 3 gating", async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);
    const conn = await createE2eDbConnection();
    let planJobId: string | null = null;
    let runningSeenResolve: (() => void) | null = null;
    const runningSeen = new Promise<void>((resolve) => {
      runningSeenResolve = resolve;
    });

    try {
      const userId = await readAuthenticatedUserId(page.request, token);
      await initializeDraft(page.request, token, draftId);
      planJobId = await seedCompletedStoryboardPlanJob(conn, {
        draftId,
        userId,
        plan: PLAN,
      });

      const illustrationMocks = await installStoryboardIllustrationMocks(page, {
        token,
        draftId,
        planJobId,
        onIllustrationsRunning: () => runningSeenResolve?.(),
      });

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      await waitForCanvas(page);

      await expect(page.getByTestId("storyboard-plan-generate-button")).toHaveCount(0);
      await expect(page.getByTestId("storyboard-illustration-generate-button")).toHaveCount(0);
      await expect(page.getByTestId("scene-block-node")).toHaveCount(3, { timeout: 20_000 });

      const nextButton = page.getByTestId("next-step3-button");
      await runningSeen;
      await expect(page.getByText("Creating visual style reference")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("storyboard-reference-preview-fallback")).toHaveText("Wait");
      await expect(nextButton).toBeDisabled();

      illustrationMocks.completeReference();
      await expect(page.getByTestId("principal-image-modal")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("principal-image-preview-img")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("principal-image-approve-button")).toBeEnabled();
      await expect(nextButton).toBeDisabled();
      expect(illustrationMocks.getSceneStartCount()).toBe(0);

      await page.getByTestId("principal-image-approve-button").click();
      await expect(page.getByTestId("principal-image-modal")).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByText("Image running").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Generating scene illustrations")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("storyboard-reference-preview-image")).toBeVisible({ timeout: 10_000 });
      await expect(nextButton).toBeDisabled();
      await expect(page.getByTestId("back-button")).toBeEnabled();
      await expect(page.getByTestId("home-button")).toBeEnabled();

      illustrationMocks.completeInitialRun();
      await expect(page.getByText("Image failed")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Image ready").first()).toBeVisible({ timeout: 10_000 });
      await expect(nextButton).toBeDisabled();

      const failedScene = page.getByTestId("scene-block-node").filter({ hasText: "Image failed" });
      await failedScene.getByTestId("illustration-retry-button").click();
      await expect(nextButton).toBeDisabled();
      await expect(page.getByText("Image running")).toBeVisible({ timeout: 10_000 });

      illustrationMocks.completeRetry();
      await expect(page.getByText("Image ready")).toHaveCount(3, { timeout: 15_000 });
      await expect(nextButton).toBeEnabled();
      await expect(page.getByTestId("thumbnail-img")).toHaveCount(3, { timeout: 15_000 });
    } finally {
      if (planJobId) await deleteStoryboardPlanJob(conn, planJobId).catch(() => {});
      await cleanupDraft(page.request, token, draftId);
      await conn.end();
    }
  });

  test("retries a failed canonical reference from the main illustration control", async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);
    const conn = await createE2eDbConnection();
    let planJobId: string | null = null;

    try {
      const userId = await readAuthenticatedUserId(page.request, token);
      await initializeDraft(page.request, token, draftId);
      planJobId = await seedCompletedStoryboardPlanJob(conn, {
        draftId,
        userId,
        plan: PLAN,
      });

      const illustrationMocks = await installStoryboardIllustrationMocks(page, {
        token,
        draftId,
        planJobId,
        onIllustrationsRunning: () => {},
      });

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      await waitForCanvas(page);

      await expect(page.getByTestId("storyboard-plan-generate-button")).toHaveCount(0);
      await expect(page.getByTestId("storyboard-illustration-generate-button")).toHaveCount(0);
      await expect(page.getByTestId("scene-block-node")).toHaveCount(3, { timeout: 20_000 });

      illustrationMocks.failReference();
      await expect(page.getByText("Visual style reference failed")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("storyboard-reference-preview-fallback")).toHaveText("Failed");
      await expect(page.getByTestId("next-step3-button")).toBeDisabled();
      const illustrationButton = page.getByTestId("storyboard-illustration-retry-button");
      await expect(illustrationButton).toHaveText("Retry");

      await illustrationButton.click();
      await expect(page.getByText("Creating visual style reference")).toBeVisible({ timeout: 10_000 });

      illustrationMocks.completeReference();
      await expect(page.getByTestId("principal-image-modal")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("principal-image-approve-button")).toBeEnabled();
      expect(illustrationMocks.getSceneStartCount()).toBe(0);
      await page.getByTestId("principal-image-approve-button").click();
      await expect(page.getByText("Generating scene illustrations")).toBeVisible({ timeout: 10_000 });
    } finally {
      if (planJobId) await deleteStoryboardPlanJob(conn, planJobId).catch(() => {});
      await cleanupDraft(page.request, token, draftId);
      await conn.end();
    }
  });

  test("shows a merged reference preview for multi-image-reference drafts", async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);
    const conn = await createE2eDbConnection();
    let planJobId: string | null = null;
    let sourceReferenceFileIds: string[] = [];

    try {
      const userId = await readAuthenticatedUserId(page.request, token);
      sourceReferenceFileIds = await seedDraftImageReferences({
        conn,
        draftId,
        userId,
      });
      await initializeDraft(page.request, token, draftId);
      planJobId = await seedCompletedStoryboardPlanJob(conn, {
        draftId,
        userId,
        plan: PLAN,
      });

      const illustrationMocks = await installStoryboardIllustrationMocks(page, {
        token,
        draftId,
        planJobId,
        sourceReferenceFileIds,
        onIllustrationsRunning: () => {},
      });

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      await waitForCanvas(page);

      await expect(page.getByTestId("storyboard-plan-generate-button")).toHaveCount(0);
      await expect(page.getByTestId("storyboard-illustration-generate-button")).toHaveCount(0);
      await expect(page.getByText("Creating visual style reference")).toBeVisible({ timeout: 10_000 });

      illustrationMocks.completeReference();
      const referenceImage = page.getByTestId("storyboard-reference-preview-image");
      await expect(referenceImage).toBeVisible({ timeout: 10_000 });
      await expect(referenceImage).toHaveAttribute(
        "src",
        /file-canonical-reference-merged-2\/thumbnail/,
      );
      await expect(page.getByTestId("principal-image-modal")).toBeVisible({ timeout: 10_000 });
      expect(illustrationMocks.getSceneStartCount()).toBe(0);
      await page.getByTestId("principal-image-approve-button").click();
      await expect(page.getByText("Generating scene illustrations")).toBeVisible({ timeout: 10_000 });
    } finally {
      if (planJobId) await deleteStoryboardPlanJob(conn, planJobId).catch(() => {});
      await cleanupDraftImageReferences(conn, sourceReferenceFileIds).catch(() => {});
      await cleanupDraft(page.request, token, draftId);
      await conn.end();
    }
  });

  test("keeps scene generation blocked while principal image is edited, replaced, and given extra references", async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);
    const conn = await createE2eDbConnection();
    let planJobId: string | null = null;
    let sourceReferenceFileIds: string[] = [];

    try {
      const userId = await readAuthenticatedUserId(page.request, token);
      sourceReferenceFileIds = await seedDraftImageReferences({
        conn,
        draftId,
        userId,
      });
      await initializeDraft(page.request, token, draftId);
      planJobId = await seedCompletedStoryboardPlanJob(conn, {
        draftId,
        userId,
        plan: PLAN,
      });

      const illustrationMocks = await installStoryboardIllustrationMocks(page, {
        token,
        draftId,
        planJobId,
        sourceReferenceFileIds: [sourceReferenceFileIds[0]!],
        onIllustrationsRunning: () => {},
      });

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      await waitForCanvas(page);
      await expect(page.getByTestId("scene-block-node")).toHaveCount(3, { timeout: 20_000 });

      illustrationMocks.completeReference();
      await expect(page.getByTestId("principal-image-modal")).toBeVisible({ timeout: 10_000 });
      expect(illustrationMocks.getSceneStartCount()).toBe(0);

      await page.getByTestId("principal-image-edit-prompt").fill("Make the creator face camera.");
      await page.getByTestId("principal-image-edit-button").click();
      await expect(page.getByText("Creating visual style reference")).toBeVisible({ timeout: 10_000 });
      expect(illustrationMocks.getSceneStartCount()).toBe(0);

      illustrationMocks.recoverReference();
      await expect(page.getByTestId("principal-image-modal")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("principal-image-approve-button")).toBeEnabled();

      await page.getByTestId("principal-image-replace-button").click();
      await expect(page.getByTestId("picker-dialog")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Style reference 1" }).click();
      await expect(page.getByTestId("picker-dialog")).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByTestId("principal-image-modal")).toBeVisible({ timeout: 10_000 });
      expect(illustrationMocks.getSceneStartCount()).toBe(0);

      await page.getByTestId("principal-image-add-reference-button").click();
      await expect(page.getByTestId("picker-dialog")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Style reference 2" }).click();
      await expect(page.getByTestId("picker-dialog")).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByTestId("principal-image-reference-preview")).toHaveCount(2);
      await expect(page.getByTestId("principal-image-reference-preview").last()).toHaveAttribute(
        "title",
        sourceReferenceFileIds[1]!,
      );
      expect(illustrationMocks.getSceneStartCount()).toBe(0);
      await expect(page.getByTestId("next-step3-button")).toBeDisabled();

      await page.getByTestId("principal-image-approve-button").click();
      await expect(page.getByText("Generating scene illustrations")).toBeVisible({ timeout: 10_000 });
      expect(illustrationMocks.getSceneStartCount()).toBe(1);
    } finally {
      if (planJobId) await deleteStoryboardPlanJob(conn, planJobId).catch(() => {});
      await cleanupDraftImageReferences(conn, sourceReferenceFileIds).catch(() => {});
      await cleanupDraft(page.request, token, draftId);
      await conn.end();
    }
  });
});
