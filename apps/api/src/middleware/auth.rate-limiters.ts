import rateLimit from 'express-rate-limit';

/** Rate limiter for registration: 5 requests per IP per hour. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/** Rate limiter for login: 5 failed attempts per email per 15 minutes. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  keyGenerator: (req) => {
    const body = req.body as { email?: string };
    return body.email ?? req.ip ?? 'unknown';
  },
});
