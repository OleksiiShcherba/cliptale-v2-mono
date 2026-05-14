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
): IllustrationItem[] {
  return sceneBlockIds.map((blockId, index) => {
    const status = overrides.get(blockId) ?? "queued";
    return {
      blockId,
      status,
      jobId: `job-${index + 1}`,
      outputFileId: status === "ready" ? readyFileId(blockId) : null,
      errorMessage: status === "failed" ? "Provider rejected this scene." : null,
    };
  });
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
  },
): Promise<{
  completeInitialRun: () => void;
  completeRetry: () => void;
}> {
  let latestStoryboardState: StoryboardState | null = null;
  let sceneBlockIds: string[] = [];
  let startCount = 0;
  let retryStarted = false;
  let initialRunComplete = false;
  let retryComplete = false;
  const readyBlockIds = new Set<string>();
  const failedBlockIds = new Set<string>();

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "GET" && path.includes("/assets/") && path.endsWith("/thumbnail")) {
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
        await route.fulfill(jsonResponse({ items: [] }));
        return;
      }

      if (retryStarted && retryComplete) {
        failedBlockIds.clear();
        readyBlockIds.add(sceneBlockIds[1]!);
      } else if (retryStarted) {
        params.onIllustrationsRunning();
        await route.fulfill(
          jsonResponse({
            items: buildItems(sceneBlockIds, new Map([
              [sceneBlockIds[0]!, "ready"],
              [sceneBlockIds[1]!, "running"],
              [sceneBlockIds[2]!, "ready"],
            ])),
          }),
        );
        return;
      } else if (initialRunComplete) {
        readyBlockIds.add(sceneBlockIds[0]!);
        readyBlockIds.add(sceneBlockIds[2]!);
        failedBlockIds.add(sceneBlockIds[1]!);
      } else if (startCount > 0) {
        params.onIllustrationsRunning();
        await route.fulfill(
          jsonResponse({
            items: buildItems(sceneBlockIds, new Map(sceneBlockIds.map((id) => [id, "running"]))),
          }),
        );
        return;
      }

      await route.fulfill(
        jsonResponse({
          items: buildItems(sceneBlockIds, new Map([
            ...Array.from(readyBlockIds).map((id) => [id, "ready"] as const),
            ...Array.from(failedBlockIds).map((id) => [id, "failed"] as const),
          ])),
        }),
      );
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/illustrations`
    ) {
      startCount += 1;
      await route.fulfill(
        jsonResponse({
          items: buildItems(sceneBlockIds, new Map(sceneBlockIds.map((id) => [id, "queued"]))),
        }, 202),
      );
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
        jsonResponse({
          items: buildItems(sceneBlockIds, new Map([
            [sceneBlockIds[0]!, "ready"],
            [sceneBlockIds[1]!, "queued"],
            [sceneBlockIds[2]!, "ready"],
          ])),
        }, 202),
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
    completeInitialRun: () => {
      initialRunComplete = true;
    },
    completeRetry: () => {
      retryComplete = true;
    },
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

      await page.getByTestId("storyboard-plan-generate-button").click();
      await expect(page.getByTestId("scene-block-node")).toHaveCount(3, { timeout: 20_000 });

      const nextButton = page.getByTestId("next-step3-button");
      await runningSeen;
      await expect(page.getByText("Image running").first()).toBeVisible({ timeout: 10_000 });
      await expect(nextButton).toBeDisabled();
      await expect(page.getByTestId("back-button")).toBeEnabled();
      await expect(page.getByTestId("home-button")).toBeEnabled();

      illustrationMocks.completeInitialRun();
      await expect(page.getByText("Image failed")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Image ready").first()).toBeVisible({ timeout: 10_000 });
      await expect(nextButton).toBeEnabled();

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
});
