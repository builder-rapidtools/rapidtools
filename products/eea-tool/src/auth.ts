/**
 * Multi-tenant API key authentication
 *
 * Keys are stored as hashes in KV:
 * - apikeyhash:{sha256(api_key)} → ApiKeyEntry
 *
 * Raw API keys are NEVER stored.
 */

import { Env, CONFIG } from './env';
import { sha256 } from './hash';

export interface ApiKeyEntry {
  key_id: string;
  status: 'active' | 'disabled';
  plan: 'free' | 'standard' | 'enterprise';
  created_at: string;
  rate_limit_per_min: number;
  description?: string;
}

const KEY_PREFIX_APIKEY = 'apikeyhash:';

/**
 * Hash an API key for lookup
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  return sha256(apiKey);
}

/**
 * Lookup API key entry by raw key
 * Returns null if not found or disabled
 */
export async function lookupApiKey(
  kv: KVNamespace,
  apiKey: string
): Promise<ApiKeyEntry | null> {
  const keyHash = await hashApiKey(apiKey);
  const data = await kv.get(`${KEY_PREFIX_APIKEY}${keyHash}`);

  if (!data) return null;

  const entry = JSON.parse(data) as ApiKeyEntry;

  // Reject disabled keys
  if (entry.status !== 'active') return null;

  return entry;
}

/**
 * Store API key entry (for admin tooling)
 * Takes the hash, not the raw key
 */
export async function storeApiKeyEntry(
  kv: KVNamespace,
  keyHash: string,
  entry: ApiKeyEntry
): Promise<void> {
  await kv.put(`${KEY_PREFIX_APIKEY}${keyHash}`, JSON.stringify(entry));
}

/**
 * Get rate limit for a key entry
 */
export function getRateLimit(entry: ApiKeyEntry): number {
  return entry.rate_limit_per_min || CONFIG.DEFAULT_RATE_LIMIT_PER_MIN;
}
