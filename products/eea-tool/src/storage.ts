/**
 * KV Storage abstraction for attestations
 *
 * Key patterns:
 * - attestation:{attestation_id} → full attestation record JSON
 * - hash:{event_hash} → attestation_id (idempotency mapping)
 *
 * Both keys use TTL based on EEA_RETENTION_DAYS.
 */

import { Env, CONFIG } from './env';

export interface AttestationRecord {
  attestation_id: string;
  schema_version: string;
  attested_at: string;
  event_hash: string;
  attestation_sig: string;
  canonical_event: Record<string, unknown>;
}

const KEY_PREFIX_ATTESTATION = 'attestation:';
const KEY_PREFIX_HASH = 'hash:';

/**
 * Calculate TTL in seconds from retention days
 */
function getRetentionTtl(env: Env): number {
  const days = env.EEA_RETENTION_DAYS
    ? parseInt(env.EEA_RETENTION_DAYS, 10)
    : CONFIG.DEFAULT_RETENTION_DAYS;
  return days * 24 * 60 * 60; // Convert days to seconds
}

/**
 * Store a new attestation record with TTL
 */
export async function storeAttestation(
  env: Env,
  record: AttestationRecord
): Promise<void> {
  const ttl = getRetentionTtl(env);

  // Store the full record with TTL
  await env.EEA_KV.put(
    `${KEY_PREFIX_ATTESTATION}${record.attestation_id}`,
    JSON.stringify(record),
    { expirationTtl: ttl }
  );

  // Store hash → id mapping for idempotency with TTL
  await env.EEA_KV.put(
    `${KEY_PREFIX_HASH}${record.event_hash}`,
    record.attestation_id,
    { expirationTtl: ttl }
  );
}

/**
 * Fetch attestation by ID
 */
export async function getAttestationById(
  kv: KVNamespace,
  attestationId: string
): Promise<AttestationRecord | null> {
  const data = await kv.get(`${KEY_PREFIX_ATTESTATION}${attestationId}`);
  if (!data) return null;
  return JSON.parse(data) as AttestationRecord;
}

/**
 * Lookup attestation ID by event hash (for idempotency)
 */
export async function getAttestationIdByHash(
  kv: KVNamespace,
  eventHash: string
): Promise<string | null> {
  return kv.get(`${KEY_PREFIX_HASH}${eventHash}`);
}
