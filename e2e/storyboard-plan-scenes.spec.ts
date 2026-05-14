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
  readStoryboardGraphFromDb,
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
      visualPrompt:
        "Wide cinematic desk shot with laptop, notes, and soft window light.",
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: "Cut on hand movement.",
      style: "cinematic",
    },
    {
      sceneNumber: 2,
      prompt: "Show the product workflow in motion.",
      visualPrompt:
        "Close-up interface montage with cursor motion and layered panels.",
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: "Match cut to the timeline.",
      style: "cinematic",
    },
    {
      sceneNumber: 3,
      prompt: "End on the finished video preview.",
      visualPrompt:
        "Polished preview window with a confident creator reviewing the render.",
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: "Fade out after the preview settles.",
      style: "cinematic",
    },
  ],
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

async function installStoryboardPlanMocks(
  page: Page,
  params: {
    token: string;
    draftId: string;
    jobId: string;
    plan: StoryboardPlanSeed;
    onRunning: () => void;
    onApplying: () => void;
    shouldComplete: () => boolean;
    shouldAllowApply: () => boolean;
  },
): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      request.method() === "POST" &&
      path === `/generation-drafts/${params.draftId}/storyboard-plan`
    ) {
      await route.fulfill(
        jsonResponse({ jobId: params.jobId, status: "queued" }, 202),
      );
      return;
    }

    if (
      request.method() === "GET" &&
      path ===
        `/generation-drafts/${params.draftId}/storyboard-plan/${params.jobId}`
    ) {
      if (!params.shouldComplete()) {
        params.onRunning();
        await route.fulfill(
          jsonResponse({
            jobId: params.jobId,
            status: "running",
            plan: null,
            errorMessage: null,
          }),
        );
        return;
      }

      await route.fulfill(
        jsonResponse({
          jobId: params.jobId,
          status: "completed",
          plan: params.plan,
          errorMessage: null,
        }),
      );
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/storyboards/${params.draftId}/apply-latest-plan`
    ) {
      params.onApplying();
      await expect
        .poll(params.shouldAllowApply, {
          timeout: 10_000,
          message: "test should release the delayed apply-latest-plan request",
        })
        .toBe(true);

      const proxyRes = await page.request.fetch(`${E2E_API_URL}${path}`, {
        method: request.method(),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.token}`,
        },
        data: request.postDataBuffer() ?? Buffer.from("{}"),
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
}

test.describe("Storyboard Step 2 generated scenes", () => {
  test.setTimeout(90_000);

  test("applies a completed plan through the UI while blocking unsafe Step 2 actions", async ({
    page,
  }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);
    const conn = await createE2eDbConnection();
    let planJobId: string | null = null;
    let completePolling = false;
    let allowApply = false;
    let runningSeenResolve: (() => void) | null = null;
    let applyingSeenResolve: (() => void) | null = null;
    const runningSeen = new Promise<void>((resolve) => {
      runningSeenResolve = resolve;
    });
    const applyingSeen = new Promise<void>((resolve) => {
      applyingSeenResolve = resolve;
    });

    try {
      const userId = await readAuthenticatedUserId(page.request, token);
      await initializeDraft(page.request, token, draftId);
      planJobId = await seedCompletedStoryboardPlanJob(conn, {
        draftId,
        userId,
        plan: PLAN,
      });

      await installStoryboardPlanMocks(page, {
        token,
        draftId,
        jobId: planJobId,
        plan: PLAN,
        onRunning: () => runningSeenResolve?.(),
        onApplying: () => applyingSeenResolve?.(),
        shouldComplete: () => completePolling,
        shouldAllowApply: () => allowApply,
      });

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      await waitForCanvas(page);

      const generateButton = page.getByTestId(
        "storyboard-plan-generate-button",
      );
      await expect(generateButton).toBeEnabled();
      await generateButton.click();

      const overlay = page.getByTestId("storyboard-plan-overlay");
      await expect(overlay).toBeVisible({ timeout: 10_000 });
      await expect(overlay).toHaveAttribute("aria-label", "Generation queued");
      await expect(generateButton).toBeDisabled();

      const nextButton = page.getByTestId("next-step3-button");
      await expect(nextButton).toBeDisabled();
      await expect(nextButton).toHaveAttribute("aria-disabled", "true");

      const backButton = page.getByTestId("back-button");
      const homeButton = page.getByTestId("home-button");
      await expect(backButton).toBeEnabled();
      await expect(homeButton).toBeEnabled();

      const addBlockButton = page.getByTestId("add-block-button");
      const addBox = await addBlockButton.boundingBox();
      expect(
        addBox,
        "Add Block button should be rendered under the Step 2 overlay",
      ).not.toBeNull();
      if (!addBox) throw new Error("Add Block button missing a bounding box");
      await page.mouse.click(
        addBox.x + addBox.width / 2,
        addBox.y + addBox.height / 2,
      );
      await expect(page.getByTestId("scene-block-node")).toHaveCount(0);

      await runningSeen;
      await expect(overlay).toHaveAttribute("aria-label", "Generating scenes", {
        timeout: 10_000,
      });
      await expect(nextButton).toBeDisabled();

      completePolling = true;
      await applyingSeen;
      await expect(overlay).toHaveAttribute("aria-label", "Applying scenes", {
        timeout: 10_000,
      });
      await expect(nextButton).toBeDisabled();

      allowApply = true;

      await expect(overlay).not.toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("scene-block-node")).toHaveCount(3, {
        timeout: 15_000,
      });
      await expect(page.getByTestId("scene-name")).toHaveText([
        "Scene 01",
        "Scene 02",
        "Scene 03",
      ]);
      await expect(nextButton).toBeEnabled();

      const graph = await readStoryboardGraphFromDb(conn, draftId);
      expect(graph.blocks.map((block) => block.blockType)).toEqual([
        "start",
        "scene",
        "scene",
        "scene",
        "end",
      ]);
      expect(graph.blocks.map((block) => block.name)).toEqual([
        null,
        "Scene 01",
        "Scene 02",
        "Scene 03",
        null,
      ]);
      expect(graph.edges).toHaveLength(4);

      const orderedBlockIds = graph.blocks.map((block) => block.id);
      const edgeLookup = new Map(
        graph.edges.map((edge) => [edge.sourceBlockId, edge.targetBlockId]),
      );
      for (let index = 0; index < orderedBlockIds.length - 1; index += 1) {
        expect(edgeLookup.get(orderedBlockIds[index]!)).toBe(
          orderedBlockIds[index + 1],
        );
      }

      const historyRes = await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(historyRes.status()).toBe(200);
      const history = (await historyRes.json()) as Array<{
        snapshot?: { blocks?: unknown[]; edges?: unknown[] };
      }>;
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0]?.snapshot?.blocks).toHaveLength(5);
      expect(history[0]?.snapshot?.edges).toHaveLength(4);

      await page.getByTestId("history-toggle-button").click();
      await expect(page.getByTestId("history-entry-row").first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (planJobId)
        await deleteStoryboardPlanJob(conn, planJobId).catch(() => {});
      await cleanupDraft(page.request, token, draftId);
      await conn.end();
    }
  });
});
