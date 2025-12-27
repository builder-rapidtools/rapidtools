/**
 * Router for EEA endpoints
 * Minimal manual routing without framework dependencies
 */

import { Env, CONFIG } from './env';
import { errorResponse, ErrorCodes } from './errors';
import { handleAttest } from './handlers/attest';
import { handleFetch } from './handlers/fetch';
import { lookupApiKey, ApiKeyEntry, getRateLimit } from './auth';
import { checkRateLimit } from './ratelimit';
import { createLogContext } from './logging';

/**
 * Generate a request ID for tracing
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Add standard headers to response
 */
function addHeaders(response: Response, requestId: string): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('x-request-id', requestId);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Authenticate request via x-api-key header
 * Supports both multi-tenant registry and legacy single key
 */
async function authenticate(
  request: Request,
  env: Env,
  requestId: string
): Promise<{ error: Response } | { entry: ApiKeyEntry }> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    return {
      error: errorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Missing x-api-key header',
        401,
        requestId
      ),
    };
  }

  // Try multi-tenant registry first
  const entry = await lookupApiKey(env.EEA_KV, apiKey);
  if (entry) {
    return { entry };
  }

  // Fallback to legacy single key (for migration)
  if (env.EEA_API_KEY && apiKey === env.EEA_API_KEY) {
    return {
      entry: {
        key_id: 'legacy',
        status: 'active',
        plan: 'standard',
        created_at: '2025-01-01T00:00:00Z',
        rate_limit_per_min: CONFIG.DEFAULT_RATE_LIMIT_PER_MIN,
        description: 'Legacy single API key',
      },
    };
  }

  return {
    error: errorResponse(
      ErrorCodes.UNAUTHORIZED,
      'Invalid API key',
      401,
      requestId
    ),
  };
}

/**
 * Main router
 */
export async function route(request: Request, env: Env): Promise<Response> {
  const requestId = generateRequestId();
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const logCtx = createLogContext(requestId, method, path);

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        'Access-Control-Max-Age': '86400',
        'x-request-id': requestId,
      },
    });
  }

  // Health check (no auth required)
  if (path === '/health' && method === 'GET') {
    logCtx.log(200);
    return addHeaders(
      new Response(
        JSON.stringify({
          ok: true,
          service: 'eea-tool',
          version: CONFIG.SERVICE_VERSION,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
      requestId
    );
  }

  // All other endpoints require authentication
  const authResult = await authenticate(request, env, requestId);
  if ('error' in authResult) {
    logCtx.log(401, ErrorCodes.UNAUTHORIZED);
    return addHeaders(authResult.error, requestId);
  }

  const keyEntry = authResult.entry;
  logCtx.setKeyId(keyEntry.key_id);

  // Rate limiting
  const rateLimit = getRateLimit(keyEntry);
  const rateLimitResult = await checkRateLimit(env.EEA_KV, keyEntry.key_id, rateLimit);
  if (!rateLimitResult.allowed) {
    logCtx.log(429, ErrorCodes.RATE_LIMITED);
    return addHeaders(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: ErrorCodes.RATE_LIMITED,
            message: `Rate limit exceeded: ${rateLimitResult.limit} requests per minute`,
            request_id: requestId,
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      ),
      requestId
    );
  }

  // POST /attest
  if (path === '/attest' && method === 'POST') {
    const response = await handleAttest(request, env, requestId, keyEntry, logCtx);
    return addHeaders(response, requestId);
  }

  // GET /attest/:id
  const attestMatch = path.match(/^\/attest\/([^/]+)$/);
  if (attestMatch && method === 'GET') {
    const attestationId = attestMatch[1];
    const response = await handleFetch(attestationId, env, requestId, logCtx);
    return addHeaders(response, requestId);
  }

  // 404 for unmatched routes
  logCtx.log(404, ErrorCodes.NOT_FOUND);
  return addHeaders(
    errorResponse(
      ErrorCodes.NOT_FOUND,
      `Route not found: ${method} ${path}`,
      404,
      requestId
    ),
    requestId
  );
}
