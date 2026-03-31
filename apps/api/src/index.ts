import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { config } from '@/config.js';
import { assetsRouter } from '@/routes/assets.routes.js';
import { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError } from '@/lib/errors.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.server.corsOrigin }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(assetsRouter);

// Centralized error handler — maps typed errors to HTTP status codes.
// Must be the last middleware registered.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ConflictError
  ) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // Unknown error — log internally, never expose details to the client.
  console.error('[api] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.server.port, () => {
  console.log(`API listening on port ${config.server.port}`);
});

export default app;
