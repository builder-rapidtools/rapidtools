/**
 * KV Storage abstraction for attestations
 *
 * Key patterns:
 * - attestation:{attestation_id} → full attestation record JSON
 * - hash:{event_hash} → attestation_id (idempotency mapping)
 */

import { Env } from './env';

export interface AttestationRecord {
  attestation_id: string;
  schema_version: string;
  attested_at: string;
  event_hash: string;
  canonical_event: Record<string, unknown>;
}

const KEY_PREFIX_ATTESTATION = 'attestation:';
const KEY_PREFIX_HASH = 'hash:';

/**
 * Store a new attestation record
 */
export async function storeAttestation(
  kv: KVNamespace,
  record: AttestationRecord
): Promise<void> {
  // Store the full record
  await kv.put(
    `${KEY_PREFIX_ATTESTATION}${record.attestation_id}`,
    JSON.stringify(record)
  );

  // Store hash → id mapping for idempotency
  await kv.put(
    `${KEY_PREFIX_HASH}${record.event_hash}`,
    record.attestation_id
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
