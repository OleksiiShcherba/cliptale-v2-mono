import { test, expect, type Page, type Route } from "@playwright/test";
import { E2E_API_URL } from "./helpers/env";

const DRAFT_ID = "00000000-0000-4000-8000-00000000e201";
const PROJECT_ID = "00000000-0000-4000-8000-00000000e301";
const VERSION_ID = 7301;
const SCENE_A_ID = "00000000-0000-4000-8000-00000000a201";
const SCENE_B_ID = "00000000-0000-4000-8000-00000000a202";
const FILE_A_ID = "00000000-0000-4000-8000-00000000f201";
const FILE_B_ID = "00000000-0000-4000-8000-00000000f202";
const VIDEO_A_ID = "00000000-0000-4000-8000-00000000v201";
const VIDEO_B_ID = "00000000-0000-4000-8000-00000000v202";
const E2E_API_ORIGIN = new URL(E2E_API_URL).origin;

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
  videoPrompt: string | null;
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

function storyboardState(ready: boolean): StoryboardState {
  const now = "2026-05-22T10:00:00.000Z";
  const startId = "00000000-0000-4000-8000-00000000a101";
  const endId = "00000000-0000-4000-8000-00000000a301";
  const sceneMedia = (blockId: string, fileId: string) => ready
    ? [{ id: `media-${blockId}`, fileId, mediaType: "image" as const, sortOrder: 0 }]
    : [];

  return {
    blocks: [
      {
        id: startId,
        draftId: DRAFT_ID,
        blockType: "start",
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 0,
        positionX: 60,
        positionY: 200,
        sortOrder: 0,
        style: null,
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
      {
        id: SCENE_A_ID,
        draftId: DRAFT_ID,
        blockType: "scene",
        name: "Scene 01",
        prompt: "Opening image prompt",
        videoPrompt: "Animate a slow push across the opening scene.",
        durationS: 2,
        positionX: 340,
        positionY: 200,
        sortOrder: 1,
        style: "cinematic",
        createdAt: now,
        updatedAt: now,
        mediaItems: sceneMedia(SCENE_A_ID, FILE_A_ID),
      },
      {
        id: SCENE_B_ID,
        draftId: DRAFT_ID,
        blockType: "scene",
        name: "Scene 02",
        prompt: "Second image prompt",
        videoPrompt: "Animate a smooth match cut into the second scene.",
        durationS: 3,
        positionX: 620,
        positionY: 200,
        sortOrder: 2,
        style: "cinematic",
        createdAt: now,
        updatedAt: now,
        mediaItems: sceneMedia(SCENE_B_ID, FILE_B_ID),
      },
      {
        id: endId,
        draftId: DRAFT_ID,
        blockType: "end",
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 0,
        positionX: 900,
        positionY: 200,
        sortOrder: 3,
        style: null,
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
    ],
    edges: [
      [startId, SCENE_A_ID],
      [SCENE_A_ID, SCENE_B_ID],
      [SCENE_B_ID, endId],
    ].map(([sourceBlockId, targetBlockId], index) => ({
      id: `00000000-0000-4000-8000-00000000b20${index}`,
      draftId: DRAFT_ID,
      sourceBlockId: sourceBlockId!,
      targetBlockId: targetBlockId!,
    })),
  };
}

function illustrationResponse(ready: boolean) {
  return {
    reference: {
      status: "ready",
      jobId: "reference-job",
      outputFileId: "00000000-0000-4000-8000-00000000f101",
      sourceReferenceFileIds: [],
      approvalStatus: "approved",
      errorMessage: null,
    },
    items: [
      {
        blockId: SCENE_A_ID,
        status: "ready",
        jobId: "scene-job-a",
        outputFileId: FILE_A_ID,
        errorMessage: null,
      },
      {
        blockId: SCENE_B_ID,
        status: ready ? "ready" : "running",
        jobId: "scene-job-b",
        outputFileId: ready ? FILE_B_ID : null,
        errorMessage: null,
      },
    ],
  };
}

function assembledProjectDoc(mode: "images" | "videos") {
  const trackId = mode === "videos" ? "track-storyboard-videos" : "track-storyboard-images";
  const trackName = mode === "videos" ? "Storyboard videos" : "Storyboard scenes";
  const clipType = mode === "videos" ? "video" : "image";
  const firstFileId = mode === "videos" ? VIDEO_A_ID : FILE_A_ID;
  const secondFileId = mode === "videos" ? VIDEO_B_ID : FILE_B_ID;

  return {
    schemaVersion: 1,
    id: PROJECT_ID,
    title: "Storyboard Assembly",
    fps: 30,
    durationFrames: 150,
    width: 1920,
    height: 1080,
    tracks: [{ id: trackId, type: "video", name: trackName, order: 0 }],
    clips: [
      {
        id: "00000000-0000-4000-8000-00000000c201",
        type: clipType,
        fileId: firstFileId,
        trackId,
        startFrame: 0,
        durationFrames: 60,
        trimInFrame: 0,
        opacity: 1,
        volume: 1,
      },
      {
        id: "00000000-0000-4000-8000-00000000c202",
        type: clipType,
        fileId: secondFileId,
        trackId,
        startFrame: 60,
        durationFrames: 90,
        trimInFrame: 0,
        opacity: 1,
        volume: 1,
      },
    ],
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  };
}

async function installStoryboardProjectMocks(
  page: Page,
  options: { failFirstAssembly?: boolean; initiallyReady?: boolean; failFirstVideoStatus?: boolean } = {},
): Promise<{
  completeIllustrations: () => void;
  getAssemblyAttempts: () => number;
  getVideoStatusPolls: () => number;
  getProjectModes: () => string[];
  getVideoStartPayloads: () => unknown[];
  getFileStreamUrls: () => string[];
  getSignedImageRequests: () => string[];
  getUnexpectedApiRequests: () => string[];
}> {
  let illustrationsReady = options.initiallyReady === true;
  let assemblyAttempts = 0;
  let videoStatusPolls = 0;
  let videosStarted = false;
  let videoReadySeen = false;
  let videoFailureServed = false;
  let assembledMode: "images" | "videos" = "images";
  const projectModes: string[] = [];
  const videoStartPayloads: unknown[] = [];
  const fileStreamUrls: string[] = [];
  const signedImageRequests: string[] = [];
  const unexpectedApiRequests: string[] = [];

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      request.method() === "GET" &&
      url.origin === "https://signed.test" &&
      path.match(/^\/files\/[^/]+\/stream$/)
    ) {
      signedImageRequests.push(path);
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: PNG_1X1,
      });
      return;
    }

    if (
      request.method() === "GET" &&
      url.origin === E2E_API_ORIGIN &&
      path.match(/^\/files\/[^/]+\/stream$/)
    ) {
      const signedUrl = `https://signed.test${path}`;
      fileStreamUrls.push(signedUrl);
      await route.fulfill(jsonResponse({ url: signedUrl }));
      return;
    }

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

    if (request.method() === "GET" && path.includes("/assets/") && path.endsWith("/captions")) {
      await route.fulfill(jsonResponse([]));
      return;
    }

    if (request.method() === "GET" && path === "/auth/me") {
      await route.fulfill(
        jsonResponse({
          userId: "e2e-test-user-001",
          email: "e2e@cliptale.test",
          displayName: "E2E Test User",
        }),
      );
      return;
    }

    if (request.method() === "GET" && path === `/storyboards/${DRAFT_ID}`) {
      await route.fulfill(jsonResponse(storyboardState(illustrationsReady)));
      return;
    }

    if (request.method() === "GET" && path === `/storyboards/${DRAFT_ID}/history`) {
      await route.fulfill(jsonResponse([]));
      return;
    }

    if (request.method() === "PUT" && path === `/storyboards/${DRAFT_ID}`) {
      await route.fulfill(jsonResponse({ ok: true }));
      return;
    }

    if (request.method() === "POST" && path === `/storyboards/${DRAFT_ID}/history`) {
      await route.fulfill(jsonResponse({ ok: true }, 201));
      return;
    }

    if (request.method() === "GET" && path === `/storyboards/${DRAFT_ID}/illustrations`) {
      await route.fulfill(jsonResponse(illustrationResponse(illustrationsReady)));
      return;
    }

    if (request.method() === "GET" && path === "/ai/models") {
      await route.fulfill(
        jsonResponse({
          image_to_video: [
            {
              id: "fal-ai/no-audio",
              provider: "fal",
              label: "No Audio Video",
              capability: "image_to_video",
              inputSchema: { fields: [{ name: "prompt", type: "string" }] },
            },
            {
              id: "fal-ai/audio-video",
              provider: "fal",
              label: "Audio Video",
              capability: "image_to_video",
              inputSchema: {
                fields: [
                  { name: "prompt", type: "string" },
                  { name: "generate_audio", type: "boolean" },
                ],
              },
            },
          ],
        }),
      );
      return;
    }

    if (request.method() === "POST" && path === `/storyboards/${DRAFT_ID}/videos`) {
      videosStarted = true;
      videoStatusPolls = 0;
      videoStartPayloads.push(request.postDataJSON());
      await route.fulfill(
        jsonResponse({
          items: [
            {
              blockId: SCENE_A_ID,
              status: "queued",
              jobId: "video-job-a",
              modelId: "fal-ai/audio-video",
              generateAudio: true,
              outputFileId: null,
              errorMessage: null,
            },
            {
              blockId: SCENE_B_ID,
              status: "queued",
              jobId: "video-job-b",
              modelId: "fal-ai/audio-video",
              generateAudio: true,
              outputFileId: null,
              errorMessage: null,
            },
          ],
        }, 202),
      );
      return;
    }

    if (request.method() === "GET" && path === `/storyboards/${DRAFT_ID}/videos`) {
      videoStatusPolls += 1;
      const failed = options.failFirstVideoStatus === true && !videoFailureServed;
      if (failed) videoFailureServed = true;
      const ready = videosStarted && !failed && videoStatusPolls >= 2;
      if (ready) videoReadySeen = true;
      await route.fulfill(
        jsonResponse({
          items: [
            {
              blockId: SCENE_A_ID,
              status: failed ? "failed" : ready ? "ready" : "running",
              jobId: "video-job-a",
              modelId: "fal-ai/audio-video",
              generateAudio: true,
              outputFileId: ready ? VIDEO_A_ID : null,
              errorMessage: failed ? "Provider video failed" : null,
            },
            {
              blockId: SCENE_B_ID,
              status: ready ? "ready" : "running",
              jobId: "video-job-b",
              modelId: "fal-ai/audio-video",
              generateAudio: true,
              outputFileId: ready ? VIDEO_B_ID : null,
              errorMessage: null,
            },
          ],
        }),
      );
      return;
    }

    if (request.method() === "POST" && path === `/storyboards/${DRAFT_ID}/project`) {
      assemblyAttempts += 1;
      const body = request.postDataJSON() as { mode?: "images" | "videos" };
      assembledMode = body.mode === "videos" ? "videos" : "images";
      projectModes.push(assembledMode);
      if (assembledMode === "videos" && !videoReadySeen) {
        await route.fulfill(jsonResponse({ error: "Videos are not ready yet" }, 422));
        return;
      }
      if (options.failFirstAssembly && assemblyAttempts === 1) {
        await route.fulfill(jsonResponse({ error: "Project assembly failed" }, 500));
        return;
      }
      await route.fulfill(jsonResponse({ projectId: PROJECT_ID, versionId: VERSION_ID }, 201));
      return;
    }

    if (request.method() === "GET" && path === `/projects/${PROJECT_ID}/versions/latest`) {
      await route.fulfill(
        jsonResponse({
          versionId: VERSION_ID,
          docJson: assembledProjectDoc(assembledMode),
          createdAt: "2026-05-22T10:00:00.000Z",
        }),
      );
      return;
    }

    if (request.method() === "GET" && path === `/projects/${PROJECT_ID}/ui-state`) {
      await route.fulfill(jsonResponse({ state: null, updatedAt: null }));
      return;
    }

    if (request.method() === "PUT" && path === `/projects/${PROJECT_ID}/ui-state`) {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return;
    }

    if (request.method() === "GET" && path === `/projects/${PROJECT_ID}/assets`) {
      await route.fulfill(
        jsonResponse({
          items: [
            asset(FILE_A_ID, "scene-a.png"),
            asset(FILE_B_ID, "scene-b.png"),
            asset(VIDEO_A_ID, "scene-a.mp4", "video/mp4"),
            asset(VIDEO_B_ID, "scene-b.mp4", "video/mp4"),
          ],
          nextCursor: null,
          totals: { count: 2, bytesUsed: 256 },
        }),
      );
      return;
    }

    if (request.method() === "GET" && path === `/assets/${FILE_A_ID}`) {
      await route.fulfill(jsonResponse(asset(FILE_A_ID, "scene-a.png")));
      return;
    }

    if (request.method() === "GET" && path === `/assets/${FILE_B_ID}`) {
      await route.fulfill(jsonResponse(asset(FILE_B_ID, "scene-b.png")));
      return;
    }

    if (request.method() === "GET" && path === `/assets/${VIDEO_A_ID}`) {
      await route.fulfill(jsonResponse(asset(VIDEO_A_ID, "scene-a.mp4", "video/mp4")));
      return;
    }

    if (request.method() === "GET" && path === `/assets/${VIDEO_B_ID}`) {
      await route.fulfill(jsonResponse(asset(VIDEO_B_ID, "scene-b.mp4", "video/mp4")));
      return;
    }

    if (request.method() === "GET" && path === `/projects/${PROJECT_ID}/renders`) {
      await route.fulfill(jsonResponse({ items: [] }));
      return;
    }

    if (url.origin === E2E_API_ORIGIN) {
      unexpectedApiRequests.push(`${request.method()} ${path}`);
      await route.fulfill(
        jsonResponse(
          { error: `Unexpected API request in storyboard project E2E: ${request.method()} ${path}` },
          599,
        ),
      );
      return;
    }

    await route.fallback();
  });

  return {
    completeIllustrations: () => {
      illustrationsReady = true;
    },
    getAssemblyAttempts: () => assemblyAttempts,
    getVideoStatusPolls: () => videoStatusPolls,
    getProjectModes: () => [...projectModes],
    getVideoStartPayloads: () => [...videoStartPayloads],
    getFileStreamUrls: () => [...fileStreamUrls],
    getSignedImageRequests: () => [...signedImageRequests],
    getUnexpectedApiRequests: () => [...unexpectedApiRequests],
  };
}

function asset(id: string, filename: string, contentType = "image/png") {
  return {
    id,
    projectId: PROJECT_ID,
    filename,
    displayName: null,
    contentType,
    downloadUrl: `https://example.test/${filename}`,
    status: "ready",
    durationSeconds: null,
    width: 1920,
    height: 1080,
    fileSizeBytes: 128,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  };
}

test.describe("Storyboard Step 3 project handoff", () => {
  test.setTimeout(60_000);

  test("gates Step 3 until scenes are ready, assembles a project, and hydrates the editor", async ({ page }) => {
    const mocks = await installStoryboardProjectMocks(page);

    await page.goto(`/storyboard/${DRAFT_ID}`);
    await expect(page.getByTestId("storyboard-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("scene-block-node")).toHaveCount(2, { timeout: 15_000 });

    const nextButton = page.getByTestId("next-step3-button");
    await expect(nextButton).toBeDisabled();
    await expect(page.getByText("Image running")).toBeVisible({ timeout: 10_000 });

    mocks.completeIllustrations();
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });

    await nextButton.click();
    await expect(page.getByTestId("step3-generation-modal")).toBeVisible();
    await page.getByTestId("step3-skip-videos-button").click();
    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${PROJECT_ID}$`), { timeout: 15_000 });
    await expect(page.getByRole("toolbar", { name: "Playback controls" })).toBeVisible({ timeout: 15_000 });
    const imageClips = page.getByRole("button", { name: /Clip: image/ });
    await expect(imageClips).toHaveCount(2);
    await expect(imageClips.nth(0)).toHaveAccessibleName(/Clip: image, starts at frame 0/);
    await expect(imageClips.nth(1)).toHaveAccessibleName(/Clip: image, starts at frame 60/);
    await expect(page.getByLabel("Current frame")).toContainText("/ 150");
    expect(mocks.getProjectModes()).toEqual(["images"]);
    expect(mocks.getFileStreamUrls()).toEqual(
      expect.arrayContaining([
        `https://signed.test/files/${FILE_A_ID}/stream`,
        `https://signed.test/files/${FILE_B_ID}/stream`,
      ]),
    );
    expect(mocks.getSignedImageRequests()).toEqual(
      expect.arrayContaining([`/files/${FILE_A_ID}/stream`, `/files/${FILE_B_ID}/stream`]),
    );
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });

  test("starts video generation, waits for video outputs, and hydrates video clips", async ({ page }) => {
    const mocks = await installStoryboardProjectMocks(page, { initiallyReady: true });

    await page.goto(`/storyboard/${DRAFT_ID}`);
    const nextButton = page.getByTestId("next-step3-button");
    await expect(nextButton).toBeEnabled({ timeout: 15_000 });
    await nextButton.click();

    await expect(page.getByTestId("step3-generation-modal")).toBeVisible();
    await expect(page.getByTestId("step3-generate-audio-checkbox")).toHaveCount(0);
    await page.getByTestId("step3-video-model-select").selectOption("fal-ai/audio-video");
    await expect(page.getByTestId("step3-generate-audio-checkbox")).toBeVisible();
    await page.getByTestId("step3-generate-audio-checkbox").check();
    await page.getByTestId("step3-start-videos-button").click();

    await expect(page.getByText("Generating storyboard videos...")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${PROJECT_ID}$`), { timeout: 20_000 });
    const videoClips = page.getByRole("button", { name: /Clip: video/ });
    await expect(videoClips).toHaveCount(2);
    await expect(videoClips.nth(0)).toHaveAccessibleName(/Clip: video, starts at frame 0/);
    await expect(videoClips.nth(1)).toHaveAccessibleName(/Clip: video, starts at frame 60/);
    expect(mocks.getVideoStartPayloads()).toEqual([
      { modelId: "fal-ai/audio-video", generateAudio: true },
    ]);
    expect(mocks.getVideoStatusPolls()).toBeGreaterThanOrEqual(2);
    expect(mocks.getProjectModes()).toEqual(["videos"]);
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });

  test("shows video generation failure controls and retries successfully", async ({ page }) => {
    const mocks = await installStoryboardProjectMocks(page, {
      failFirstVideoStatus: true,
      initiallyReady: true,
    });

    await page.goto(`/storyboard/${DRAFT_ID}`);
    await expect(page.getByTestId("next-step3-button")).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId("next-step3-button").click();
    await page.getByTestId("step3-video-model-select").selectOption("fal-ai/audio-video");
    await page.getByTestId("step3-start-videos-button").click();

    await expect(page.getByText("Provider video failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();

    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${PROJECT_ID}$`), { timeout: 20_000 });
    expect(mocks.getVideoStatusPolls()).toBeGreaterThanOrEqual(2);
    expect(mocks.getProjectModes()).toEqual(["videos"]);
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });

  test("shows project assembly failure controls and retries successfully", async ({ page }) => {
    const mocks = await installStoryboardProjectMocks(page, {
      failFirstAssembly: true,
      initiallyReady: true,
    });

    await page.goto(`/storyboard/${DRAFT_ID}`);
    const nextButton = page.getByTestId("next-step3-button");
    await expect(nextButton).toBeEnabled({ timeout: 15_000 });
    await nextButton.click();
    await page.getByTestId("step3-skip-videos-button").click();

    await expect(page.getByText(/POST .*storyboards.*project failed: 500/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to storyboard" })).toHaveAttribute(
      "href",
      `/storyboard/${DRAFT_ID}`,
    );

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${PROJECT_ID}$`), { timeout: 15_000 });
    expect(mocks.getAssemblyAttempts()).toBe(2);
    expect(mocks.getUnexpectedApiRequests()).toEqual([]);
  });
});
