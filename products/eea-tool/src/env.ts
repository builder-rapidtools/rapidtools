/**
 * Environment bindings for EEA Worker
 */

export interface Env {
  // KV namespace for attestations, API keys, and rate limiting
  EEA_KV: KVNamespace;

  // HMAC signing key for tamper-evident signatures
  EEA_SIGNING_KEY: string;

  // Retention period in days (default: 30)
  EEA_RETENTION_DAYS?: string;

  // Legacy single API key (deprecated, for migration only)
  EEA_API_KEY?: string;
}

// Configuration constants
export const CONFIG = {
  // Request size limits
  MAX_BODY_BYTES: 128 * 1024, // 128KB
  MAX_PAYLOAD_BYTES: 64 * 1024, // 64KB for payload.raw field

  // Default retention in days
  DEFAULT_RETENTION_DAYS: 30,

  // Default rate limit per minute
  DEFAULT_RATE_LIMIT_PER_MIN: 60,

  // Schema version
  SCHEMA_VERSION: 'eea.v1',

  // Service version
  SERVICE_VERSION: '1.1.0',
} as const;
