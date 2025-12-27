/**
 * Tamper-evident receipt signing
 *
 * Computes HMAC-SHA256 signature over attestation fields.
 * Format: hmacsha256:<hex>
 *
 * sig_payload = "eea.v1|<attestation_id>|<event_hash>|<attested_at>"
 */

import { CONFIG } from './env';

/**
 * Compute attestation signature
 */
export async function signAttestation(
  signingKey: string,
  attestationId: string,
  eventHash: string,
  attestedAt: string
): Promise<string> {
  const sigPayload = `${CONFIG.SCHEMA_VERSION}|${attestationId}|${eventHash}|${attestedAt}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingKey);
  const messageData = encoder.encode(sigPayload);

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Compute HMAC
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const sigArray = Array.from(new Uint8Array(signature));
  const sigHex = sigArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `hmacsha256:${sigHex}`;
}

/**
 * Verify attestation signature
 */
export async function verifyAttestation(
  signingKey: string,
  attestationId: string,
  eventHash: string,
  attestedAt: string,
  providedSig: string
): Promise<boolean> {
  const expectedSig = await signAttestation(
    signingKey,
    attestationId,
    eventHash,
    attestedAt
  );
  return expectedSig === providedSig;
}
