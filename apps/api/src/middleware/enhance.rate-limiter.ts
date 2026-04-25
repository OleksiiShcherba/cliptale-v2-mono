import rateLimit from 'express-rate-limit';

/**
 * Per-user rate limiter for the AI Enhance endpoint.
 *
 * Keyed on `req.user!.userId` (not IP) so that two requests from the same
 * user but different IPs (e.g. switching networks) still share the same
 * bucket, and two users on the same IP (e.g. corporate NAT) do not.
 *
 * Must be applied AFTER authMiddleware so that req.user is populated.
 *
 * Limits: 10 requests per user per hour.
 */
export const enhancePromptLimiter = rateLimit({
  windowMs: 3_600_000, // 1 hour in ms
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Enhance rate limit exceeded. You may enhance a prompt up to 10 times per hour.' },
  keyGenerator: (req) => req.user!.userId,
});
