/**
 * EEA (Economic Event Attestation) Worker
 *
 * Deterministic attestation microservice for economic events.
 * Creates immutable, hashable records of financial events.
 */

import { Env } from './env';
import { route } from './routes';
import { errorResponse, ErrorCodes } from './errors';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error('Unhandled error:', error);
      const requestId = crypto.randomUUID();
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Internal server error',
        500,
        requestId
      );
    }
  },
};
