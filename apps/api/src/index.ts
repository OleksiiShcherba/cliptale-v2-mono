import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { config } from '@/config.js';
import { authRouter } from '@/routes/auth.routes.js';
import { assetsRouter } from '@/routes/assets.routes.js';
import { captionsRouter } from '@/routes/captions.routes.js';
import { clipsRouter } from '@/routes/clips.routes.js';
import { projectsRouter } from '@/routes/projects.routes.js';
import { versionsRouter } from '@/routes/versions.routes.js';
import { rendersRouter } from '@/routes/renders.routes.js';
import { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, UnprocessableEntityError } from '@/lib/errors.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.server.corsOrigin, credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(authRouter);
app.use(assetsRouter);
app.use(captionsRouter);
app.use(clipsRouter);
app.use(projectsRouter);
app.use(versionsRouter);
app.use(rendersRouter);

// Centralized error handler — maps typed errors to HTTP status codes.
// Must be the last middleware registered.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ConflictError ||
    err instanceof UnprocessableEntityError
  ) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // Unknown error — log internally, never expose details to the client.
  console.error('[api] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only bind the port when running as the entry point, not when imported by tests.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  app.listen(config.server.port, () => {
    console.log(`API listening on port ${config.server.port}`);
  });
}

export default app;
