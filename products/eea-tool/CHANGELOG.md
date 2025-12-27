# Changelog

All notable changes to EEA (Economic Event Attestation) will be documented in this file.

## [1.1.0] - 2025-12-27

### Added

- **Multi-tenant API keys**: API keys are now stored as SHA-256 hashes in KV registry. Raw keys are never stored. Each key has associated metadata: `key_id`, `status`, `plan`, `rate_limit_per_min`.
- **Tamper-evident signatures**: Every attestation now includes `attestation_sig` field containing HMAC-SHA256 signature over `eea.v1|{attestation_id}|{event_hash}|{attested_at}`.
- **Rate limiting**: Per-key rate limiting using KV counters. Default 60 requests/minute, configurable per plan (free: 20, standard: 60, enterprise: 300).
- **Retention TTL**: Attestation records now expire based on `EEA_RETENTION_DAYS` environment variable (default: 30 days). Uses Cloudflare KV `expirationTtl`.
- **Request size limits**: Maximum 128KB request body, 64KB for `payload` field.
- **Observability**: All responses include `x-request-id` header. Structured JSON logging with `request_id`, `key_id`, `route`, `status`, `latency_ms`, `event_hash_prefix`.
- **Admin tooling**: `tools/generate-api-key.sh` script for generating and registering API keys.

### Changed

- Authentication now checks KV registry first, falls back to legacy `EEA_API_KEY` for migration.
- Error responses now include `x-request-id` header.
- Health endpoint returns service version.

### Security

- API keys stored only as hashes (SHA-256)
- HMAC signatures provide tamper-evidence for attestation records
- Rate limiting prevents abuse

## [1.0.0] - 2025-12-27

### Added

- Initial release
- `POST /attest` - Create attestation for economic event
- `GET /attest/:id` - Fetch attestation by ID
- `GET /health` - Health check endpoint
- Deterministic JSON canonicalization
- SHA-256 event hashing
- ULID-based attestation IDs
- KV-based idempotency
- Schema validation for economic events
- Support for event types: payment, refund, invoice_issued, transfer, credit_spend, payout, adjustment
