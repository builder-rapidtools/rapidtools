/**
 * Error handling utilities
 * Provides consistent error format across all endpoints
 */

export interface ErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  requestId: string
): ErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      request_id: requestId,
    },
  };
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string
): Response {
  return new Response(
    JSON.stringify(createErrorResponse(code, message, requestId)),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// Standard error codes
export const ErrorCodes = {
  INVALID_JSON: 'INVALID_JSON',
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
