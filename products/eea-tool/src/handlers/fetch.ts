/**
 * GET /attest/:id handler
 * Fetches an existing attestation by ID
 */

import { Env } from '../env';
import { errorResponse, ErrorCodes } from '../errors';
import { getAttestationById } from '../storage';

export async function handleFetch(
  attestationId: string,
  env: Env,
  requestId: string
): Promise<Response> {
  // Validate ID format (should start with eea_)
  if (!attestationId.startsWith('eea_')) {
    return errorResponse(
      ErrorCodes.NOT_FOUND,
      'Attestation not found',
      404,
      requestId
    );
  }

  // Fetch from KV
  const record = await getAttestationById(env.EEA_KV, attestationId);

  if (!record) {
    return errorResponse(
      ErrorCodes.NOT_FOUND,
      'Attestation not found',
      404,
      requestId
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      record,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
