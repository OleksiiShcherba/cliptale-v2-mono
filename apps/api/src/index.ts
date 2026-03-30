import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.server.corsOrigin }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.server.port, () => {
  console.log(`API listening on port ${config.server.port}`);
});

export default app;
