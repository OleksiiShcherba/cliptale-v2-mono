/**
 * T10 — per-Creator Redis sliding-window generation rate limit
 * NFR §6 / ADR-0004: ≤ 30 Generate runs / minute / Creator
 *
 * Keyed by Creator/user id — independent of IP middleware.
 * Uses the repo singleton ioredis client (same as BullMQ / realtime).
 *
 * Algorithm: sorted-set sliding window.
 *   - Key:   flow:generate:rate:<creatorId>
 *   - Score: Unix timestamp in ms (current time)
 *   - Each call adds a member with the current timestamp, trims entries
 *     older than windowMs, counts what remains, and denies if count > max.
 *   - TTL is refreshed to windowMs on every call so keys self-expire.
 */

import { redis } from '@/lib/redis.js';

/** Maximum allowed Generate runs per Creator per minute (NFR §6). */
export const FLOW_RATE_LIMIT_MAX = 30;

/** Sliding-window size in milliseconds (1 minute). */
export const FLOW_RATE_LIMIT_WINDOW_MS = 60_000;

export interface FlowRateLimitResult {
  /** true → the request is within the limit and may proceed. */
  allowed: boolean;
  /**
   * Seconds the caller should wait before retrying.
   * 0 when allowed = true.
   * A positive integer ≤ 60 when allowed = false.
   */
  retryAfterSeconds: number;
}

/**
 * Check (and record) a Generate attempt for the given Creator.
 *
 * Must be called exactly once per Generate attempt — calling it constitutes
 * consuming a slot.  The caller is responsible for not calling it again on
 * the same request after a denial.
 */
export async function checkFlowRateLimit(creatorId: string): Promise<FlowRateLimitResult> {
  const key = `flow:generate:rate:${creatorId}`;
  const now = Date.now();
  const windowStart = now - FLOW_RATE_LIMIT_WINDOW_MS;

  // Unique member: current timestamp in ms + a random suffix to avoid
  // collisions when two requests arrive in the same millisecond.
  const member = `${now}:${Math.random().toString(36).slice(2)}`;

  // Atomic Lua script:
  //   1. Remove all entries older than the window.
  //   2. Count remaining entries.
  //   3. If count < max: add the new entry and set TTL → allowed.
  //   4. If count >= max: find the oldest entry to compute retry-after → denied.
  //   The script returns [allowed (0|1), retryAfterMs (number)].
  const luaScript = `
local key          = KEYS[1]
local windowStart  = tonumber(ARGV[1])
local now          = tonumber(ARGV[2])
local maxAllowed   = tonumber(ARGV[3])
local windowMs     = tonumber(ARGV[4])
local member       = ARGV[5]

-- Trim entries outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Count entries in the window BEFORE adding the new one
local count = redis.call('ZCARD', key)

if count < maxAllowed then
  -- Within limit: record this attempt
  redis.call('ZADD', key, now, member)
  -- Keep the key alive for one full window after the last activity
  redis.call('PEXPIRE', key, windowMs)
  return {1, 0}
else
  -- Over limit: find the oldest entry to calculate when the window clears
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2]) or now
  local retryAfterMs = (oldestScore + windowMs) - now
  if retryAfterMs < 0 then retryAfterMs = 0 end
  return {0, retryAfterMs}
end
`;

  const result = await redis.eval(
    luaScript,
    1,       // numkeys
    key,     // KEYS[1]
    String(windowStart),           // ARGV[1]
    String(now),                   // ARGV[2]
    String(FLOW_RATE_LIMIT_MAX),   // ARGV[3]
    String(FLOW_RATE_LIMIT_WINDOW_MS), // ARGV[4]
    member,                        // ARGV[5]
  ) as [number, number];

  const [allowedFlag, retryAfterMs] = result;

  return {
    allowed: allowedFlag === 1,
    retryAfterSeconds: allowedFlag === 1 ? 0 : Math.ceil(retryAfterMs / 1000),
  };
}
