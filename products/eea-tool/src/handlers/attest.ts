/**
 * POST /attest handler
 * Creates a new attestation for an economic event
 */

import { Env, CONFIG } from '../env';
import { errorResponse, ErrorCodes } from '../errors';
import { canonicalizeEvent, canonicalizeJson } from '../canonicalize';
import { sha256 } from '../hash';
import { generateAttestationId } from '../id';
import { signAttestation } from '../signing';
import {
  storeAttestation,
  getAttestationById,
  getAttestationIdByHash,
  AttestationRecord,
} from '../storage';
import { ApiKeyEntry } from '../auth';
import { createLogContext } from '../logging';

// Valid event types
const VALID_EVENT_TYPES = new Set([
  'payment',
  'refund',
  'invoice_issued',
  'transfer',
  'credit_spend',
  'payout',
  'adjustment',
]);

// Required top-level fields
const REQUIRED_FIELDS = [
  'event_type',
  'occurred_at',
  'amount',
  'currency',
  'source_system',
  'references',
] as const;

/**
 * Validate ISO-8601 timestamp format
 */
function isValidIso8601(value: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
  if (!iso8601Regex.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Validate currency format (3-letter uppercase)
 */
function isValidCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/**
 * Validate amount format (string representing number)
 */
function isValidAmount(value: string): boolean {
  return /^-?[0-9]+(\.[0-9]+)?$/.test(value);
}

/**
 * Check if payload field exceeds size limit
 */
function checkPayloadSize(event: Record<string, unknown>, requestId: string): Response | null {
  if (event.payload && typeof event.payload === 'object') {
    const payloadStr = JSON.stringify(event.payload);
    if (payloadStr.length > CONFIG.MAX_PAYLOAD_BYTES) {
      return errorResponse(
        ErrorCodes.PAYLOAD_TOO_LARGE,
        `payload field exceeds ${CONFIG.MAX_PAYLOAD_BYTES} bytes limit`,
        413,
        requestId
      );
    }
  }
  return null;
}

/**
 * Lightweight schema validation
 */
function validateEvent(
  event: Record<string, unknown>,
  requestId: string
): Response | null {
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in event) || event[field] === undefined || event[field] === null) {
      return errorResponse(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        `Missing required field: ${field}`,
        400,
        requestId
      );
    }
  }

  // Validate event_type
  if (typeof event.event_type !== 'string' || !VALID_EVENT_TYPES.has(event.event_type)) {
    return errorResponse(
      ErrorCodes.SCHEMA_VALIDATION_FAILED,
      `Invalid event_type. Must be one of: ${Array.from(VALID_EVENT_TYPES).join(', ')}`,
      400,
      requestId
    );
  }

  // Validate occurred_at (must be ISO-8601)
  if (typeof event.occurred_at !== 'string' || !isValidIso8601(event.occurred_at)) {
    return errorResponse(
      ErrorCodes.INVALID_TIMESTAMP,
      'occurred_at must be a valid ISO-8601 timestamp (e.g., 2024-01-15T10:30:00Z)',
      400,
      requestId
    );
  }

  // Validate amount (must be string)
  if (typeof event.amount !== 'string' || !isValidAmount(event.amount)) {
    return errorResponse(
      ErrorCodes.SCHEMA_VALIDATION_FAILED,
      'amount must be a string representing a number (e.g., "100.00")',
      400,
      requestId
    );
  }

  // Validate currency
  if (typeof event.currency !== 'string' || !isValidCurrency(event.currency)) {
    return errorResponse(
      ErrorCodes.SCHEMA_VALIDATION_FAILED,
      'currency must be a 3-letter uppercase code (e.g., "USD")',
      400,
      requestId
    );
  }

  // Validate source_system
  if (typeof event.source_system !== 'string' || event.source_system.length === 0) {
    return errorResponse(
      ErrorCodes.SCHEMA_VALIDATION_FAILED,
      'source_system must be a non-empty string',
      400,
      requestId
    );
  }

  // Validate references (must be object)
  if (typeof event.references !== 'object' || event.references === null || Array.isArray(event.references)) {
    return errorResponse(
      ErrorCodes.SCHEMA_VALIDATION_FAILED,
      'references must be an object',
      400,
      requestId
    );
  }

  // Validate optional fields are objects if present
  for (const field of ['payload', 'evidence', 'meta'] as const) {
    if (field in event && event[field] !== undefined) {
      if (typeof event[field] !== 'object' || event[field] === null || Array.isArray(event[field])) {
        return errorResponse(
          ErrorCodes.SCHEMA_VALIDATION_FAILED,
          `${field} must be an object if provided`,
          400,
          requestId
        );
      }
    }
  }

  // Check payload size limit
  const payloadSizeError = checkPayloadSize(event, requestId);
  if (payloadSizeError) return payloadSizeError;

  return null; // validation passed
}

export async function handleAttest(
  request: Request,
  env: Env,
  requestId: string,
  keyEntry: ApiKeyEntry,
  logCtx: ReturnType<typeof createLogContext>
): Promise<Response> {
  // Check request body size
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > CONFIG.MAX_BODY_BYTES) {
    logCtx.log(413, ErrorCodes.PAYLOAD_TOO_LARGE);
    return errorResponse(
      ErrorCodes.PAYLOAD_TOO_LARGE,
      `Request body exceeds ${CONFIG.MAX_BODY_BYTES} bytes limit`,
      413,
      requestId
    );
  }

  // Parse JSON body
  let body: unknown;
  let bodyText: string;
  try {
    bodyText = await request.text();
    if (bodyText.length > CONFIG.MAX_BODY_BYTES) {
      logCtx.log(413, ErrorCodes.PAYLOAD_TOO_LARGE);
      return errorResponse(
        ErrorCodes.PAYLOAD_TOO_LARGE,
        `Request body exceeds ${CONFIG.MAX_BODY_BYTES} bytes limit`,
        413,
        requestId
      );
    }
    body = JSON.parse(bodyText);
  } catch {
    logCtx.log(400, ErrorCodes.INVALID_JSON);
    return errorResponse(
      ErrorCodes.INVALID_JSON,
      'Request body must be valid JSON',
      400,
      requestId
    );
  }

  // Must be an object
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    logCtx.log(400, ErrorCodes.INVALID_JSON);
    return errorResponse(
      ErrorCodes.INVALID_JSON,
      'Request body must be a JSON object',
      400,
      requestId
    );
  }

  const event = body as Record<string, unknown>;

  // Validate against schema
  const validationError = validateEvent(event, requestId);
  if (validationError) {
    logCtx.log(400, ErrorCodes.SCHEMA_VALIDATION_FAILED);
    return validationError;
  }

  // Canonicalize the event
  const canonicalEvent = canonicalizeEvent(event);
  const canonicalJson = canonicalizeJson(canonicalEvent);

  // Compute hash
  const eventHash = await sha256(canonicalJson);
  logCtx.setEventHashPrefix(eventHash);

  // Check for existing attestation (idempotency)
  const existingId = await getAttestationIdByHash(env.EEA_KV, eventHash);
  if (existingId) {
    const existingRecord = await getAttestationById(env.EEA_KV, existingId);
    if (existingRecord) {
      logCtx.log(200);
      return new Response(
        JSON.stringify({
          ok: true,
          idempotent: true,
          attestation_id: existingRecord.attestation_id,
          event_hash: existingRecord.event_hash,
          attestation_sig: existingRecord.attestation_sig,
          schema_version: existingRecord.schema_version,
          attested_at: existingRecord.attested_at,
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
  }

  // Generate new attestation
  const attestationId = generateAttestationId();
  const attestedAt = new Date().toISOString();

  // Compute tamper-evident signature
  const attestationSig = await signAttestation(
    env.EEA_SIGNING_KEY,
    attestationId,
    eventHash,
    attestedAt
  );

  const record: AttestationRecord = {
    attestation_id: attestationId,
    schema_version: CONFIG.SCHEMA_VERSION,
    attested_at: attestedAt,
    event_hash: eventHash,
    attestation_sig: attestationSig,
    canonical_event: canonicalEvent,
  };

  // Store in KV with TTL
  await storeAttestation(env, record);

  logCtx.log(201);
  return new Response(
    JSON.stringify({
      ok: true,
      attestation_id: attestationId,
      event_hash: eventHash,
      attestation_sig: attestationSig,
      schema_version: CONFIG.SCHEMA_VERSION,
      attested_at: attestedAt,
    }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      },
    }
  );
}
