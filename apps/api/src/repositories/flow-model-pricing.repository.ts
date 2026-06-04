/**
 * Repository for the `flow_model_pricing` table (migration 049 / ADR-0008 / AC-20).
 *
 * Provides a short-TTL in-process read-through cache so repeated estimate calls
 * within one server process do not hammer the DB for every request. The cache is
 * intentionally per-process and not distributed (pricing changes are operator-driven
 * and propagate within one TTL cycle; no cross-instance consistency is required).
 *
 * Cache TTL: 60 s (well within the 5-minute upper bound the repository tests verify
 * by advancing fake timers 310 s beyond the cache write).
 */
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Parsed, camelCase representation of a `flow_model_pricing` row. */
export type FlowModelPricing = {
  modelId: string;
  currency: string;
  baseAmount: number;
  perSecond: number | null;
  perImage: number | null;
  resolutionMult: Record<string, number> | null;
};

type PricingRow = RowDataPacket & {
  model_id: string;
  currency: string;
  base_amount: string | number;
  per_second: string | number | null;
  per_image: string | number | null;
  resolution_mult: string | Record<string, number> | null;
};

/** In-process read-through cache entry. */
type CacheEntry = {
  value: FlowModelPricing | null;
  expiresAt: number;
};

/** Cache TTL: 60 seconds (well within the 5-minute test bound). */
const CACHE_TTL_MS = 60_000;

/** In-process read-through cache, keyed by model id. Private — flush via clearPricingCache(). */
const cache = new Map<string, CacheEntry>();

/**
 * Flushes the in-process pricing cache. For tests / admin tooling that mutate
 * `flow_model_pricing` and need the change visible before the TTL elapses.
 */
export function clearPricingCache(): void {
  cache.clear();
}

function parseDecimal(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? parseFloat(v) : v;
}

function parseResolutionMult(
  v: string | Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? (JSON.parse(v) as Record<string, number>) : v;
}

function mapRow(row: PricingRow): FlowModelPricing {
  return {
    modelId: row.model_id,
    currency: row.currency,
    baseAmount: parseDecimal(row.base_amount) ?? 0,
    perSecond: parseDecimal(row.per_second),
    perImage: parseDecimal(row.per_image),
    resolutionMult: parseResolutionMult(row.resolution_mult),
  };
}

/**
 * Returns the pricing row for `modelId`, or `null` when no row exists.
 *
 * Results are cached in-process for up to CACHE_TTL_MS milliseconds. Two calls
 * within the TTL window hit the DB only once (the second is served from cache).
 * After the TTL expires the pool is queried again.
 */
export async function getPricingForModel(modelId: string): Promise<FlowModelPricing | null> {
  const now = Date.now();
  const entry = cache.get(modelId);
  if (entry && now < entry.expiresAt) {
    return entry.value;
  }

  const [rows] = await pool.query<PricingRow[]>(
    'SELECT model_id, currency, base_amount, per_second, per_image, resolution_mult FROM flow_model_pricing WHERE model_id = ?',
    [modelId],
  );

  const value = rows.length ? mapRow(rows[0]!) : null;
  cache.set(modelId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}
