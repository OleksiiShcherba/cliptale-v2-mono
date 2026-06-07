import { createServer } from 'node:http';

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { config } from '@/config.js';
import { runPendingMigrations } from '@/db/migrate.js';
import { authRouter } from '@/routes/auth.routes.js';
import { assetsRouter } from '@/routes/assets.routes.js';
import { fileRouter } from '@/routes/file.routes.js';
import { captionsRouter } from '@/routes/captions.routes.js';
import { clipsRouter } from '@/routes/clips.routes.js';
import { projectsRouter } from '@/routes/projects.routes.js';
import { versionsRouter } from '@/routes/versions.routes.js';
import { rendersRouter } from '@/routes/renders.routes.js';
import { aiGenerationRouter } from '@/routes/aiGeneration.routes.js';
import { generationDraftsRouter } from '@/routes/generationDrafts.routes.js';
import { userProjectUiStateRouter } from '@/routes/userProjectUiState.routes.js';
import { trashRouter } from '@/routes/trash.routes.js';
import { storyboardRouter } from '@/routes/storyboard.routes.js';
import { storyboardReferencesRouter } from '@/routes/storyboard-references.routes.js';
import { sceneTemplateRouter } from '@/routes/sceneTemplate.routes.js';
import { generationFlowsRouter } from '@/routes/generation-flows.routes.js';
import { settingsRouter } from '@/routes/settings.routes.js';
import { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, UnprocessableEntityError, GoneError, GateError, RateLimitedError } from '@/lib/errors.js';
import { attachRealtimeWebSocketServer } from '@/lib/realtime.js';

const app = express();

// Trust the first reverse proxy (Caddy in docker-compose, ALB in prod) so that
// `req.protocol`, `req.ip`, and `req.get('host')` reflect the values forwarded
// by the proxy (`X-Forwarded-Proto`, `X-Forwarded-For`, `X-Forwarded-Host`).
// Without this, `req.protocol` is always 'http' behind Caddy, which produces
// mixed-content thumbnail URLs like `http://api…/assets/:id/thumbnail` on an
// HTTPS page and causes browsers to block the image.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: config.server.corsOrigin, credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(authRouter);
app.use(assetsRouter);
app.use(fileRouter);
app.use(captionsRouter);
app.use(clipsRouter);
app.use(projectsRouter);
app.use(versionsRouter);
app.use(rendersRouter);
app.use(aiGenerationRouter);
app.use(generationDraftsRouter);
app.use(userProjectUiStateRouter);
app.use(trashRouter);
app.use(storyboardRouter);
app.use(storyboardReferencesRouter);
app.use(sceneTemplateRouter);
app.use(generationFlowsRouter);
app.use(settingsRouter);

/**
 * Centralized error handler — maps typed errors to HTTP status codes.
 *
 * Body contract (api-sync-report.md, team decision 2026-06-03): the existing
 * free-text `{ error }` key is ALWAYS present; `code` + `details` are ADDITIVE and
 * only attached for errors that carry them, so legacy clients reading only `error`
 * are unaffected.
 *   - RateLimitedError (429) → sets a `Retry-After` header (seconds) + { error, code, details }.
 *   - GateError (422, generate-ai-flow T11) → { error, code, details }.
 *   - other typed errors → bare { error } at their statusCode.
 *
 * Exported so it can be unit-tested without booting the server.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Rate limit — additive 429 sentinel (F-1/F-2). Retry-After is seconds.
  if (err instanceof RateLimitedError) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }
  // Generate-gate failures — 422 with the machine-readable code + structured details.
  if (err instanceof GateError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }
  if (
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ConflictError ||
    err instanceof UnprocessableEntityError ||
    err instanceof GoneError
  ) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // Unknown error — log internally, never expose details to the client.
  console.error('[api] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

// Must be the last middleware registered.
app.use(errorHandler);

// Only bind the port when running as the entry point, not when imported by tests.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runPendingMigrations()
    .then(() => {
      const server = createServer(app);
      attachRealtimeWebSocketServer(server);
      server.listen(config.server.port, () => {
        console.log(`API listening on port ${config.server.port}`);
      });
    })
    .catch((err: unknown) => {
      console.error('[migrate] Fatal migration error — aborting startup:', err);
      process.exit(1);
    });
}

export default app;
