/**
 * GET /attest/:id handler
 * Fetches an existing attestation by ID
 */

import { Env } from '../env';
import { errorResponse, ErrorCodes } from '../errors';
import { getAttestationById } from '../storage';
import { createLogContext } from '../logging';

export async function handleFetch(
  attestationId: string,
  env: Env,
  requestId: string,
  logCtx: ReturnType<typeof createLogContext>
): Promise<Response> {
  // Validate ID format (should start with eea_)
  if (!attestationId.startsWith('eea_')) {
    logCtx.log(404, ErrorCodes.NOT_FOUND);
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
    logCtx.log(404, ErrorCodes.NOT_FOUND);
    return errorResponse(
      ErrorCodes.NOT_FOUND,
      'Attestation not found',
      404,
      requestId
    );
  }

  logCtx.setEventHashPrefix(record.event_hash);
  logCtx.log(200);

  return new Response(
    JSON.stringify({
      ok: true,
      record,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      },
    }
  );
}
