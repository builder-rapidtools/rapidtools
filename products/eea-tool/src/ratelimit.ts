/**
 * Rate limiting using KV counters
 *
 * Keys:
 * - ratelimit:{key_id}:{minute_bucket} → count
 *
 * Minute buckets auto-expire after 2 minutes (TTL).
 */

import { Env } from './env';

const KEY_PREFIX_RATELIMIT = 'ratelimit:';
const BUCKET_TTL_SECONDS = 120; // 2 minutes, covers current + previous bucket

/**
 * Get current minute bucket identifier
 */
function getMinuteBucket(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Check and increment rate limit counter
 * Returns { allowed: boolean, current: number, limit: number }
 */
export async function checkRateLimit(
  kv: KVNamespace,
  keyId: string,
  limit: number
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const bucket = getMinuteBucket();
  const counterKey = `${KEY_PREFIX_RATELIMIT}${keyId}:${bucket}`;

  // Get current count
  const currentStr = await kv.get(counterKey);
  const current = currentStr ? parseInt(currentStr, 10) : 0;

  if (current >= limit) {
    return { allowed: false, current, limit };
  }

  // Increment counter with TTL
  await kv.put(counterKey, String(current + 1), {
    expirationTtl: BUCKET_TTL_SECONDS,
  });

  return { allowed: true, current: current + 1, limit };
}
