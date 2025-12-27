/**
 * Router for EEA endpoints
 * Minimal manual routing without framework dependencies
 */

import { Env } from './env';
import { errorResponse, ErrorCodes } from './errors';
import { handleAttest } from './handlers/attest';
import { handleFetch } from './handlers/fetch';

/**
 * Generate a request ID for tracing
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Authenticate request via x-api-key header
 */
function authenticate(request: Request, env: Env, requestId: string): Response | null {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    return errorResponse(
      ErrorCodes.UNAUTHORIZED,
      'Missing x-api-key header',
      401,
      requestId
    );
  }

  if (apiKey !== env.EEA_API_KEY) {
    return errorResponse(
      ErrorCodes.UNAUTHORIZED,
      'Invalid API key',
      401,
      requestId
    );
  }

  return null; // auth passed
}

/**
 * Main router
 */
export async function route(request: Request, env: Env): Promise<Response> {
  const requestId = generateRequestId();
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Add CORS headers to all responses
  const addCorsHeaders = (response: Response): Response => {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };

  // Health check (no auth required)
  if (path === '/health' && method === 'GET') {
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          ok: true,
          service: 'eea-tool',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
  }

  // All other endpoints require authentication
  const authError = authenticate(request, env, requestId);
  if (authError) {
    return addCorsHeaders(authError);
  }

  // POST /attest
  if (path === '/attest' && method === 'POST') {
    const response = await handleAttest(request, env, requestId);
    return addCorsHeaders(response);
  }

  // GET /attest/:id
  const attestMatch = path.match(/^\/attest\/([^/]+)$/);
  if (attestMatch && method === 'GET') {
    const attestationId = attestMatch[1];
    const response = await handleFetch(attestationId, env, requestId);
    return addCorsHeaders(response);
  }

  // 404 for unmatched routes
  return addCorsHeaders(
    errorResponse(
      ErrorCodes.NOT_FOUND,
      `Route not found: ${method} ${path}`,
      404,
      requestId
    )
  );
}
