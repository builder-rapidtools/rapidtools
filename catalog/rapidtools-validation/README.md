# RapidTools Validation

API-first validation service for structured data formats with deterministic validation, idempotent operations, and edge-deployed performance.

## What it does

- Validates CSV timeseries data (currently GA4 analytics format)
- Provides deterministic, reproducible validation results
- Supports idempotent request handling with 24-hour TTL
- Returns structured findings with error codes and pointers

## What it doesn't do

- Does not store or retain validated data
- Does not transform or modify input data
- Does not provide data analytics or insights
- Does not connect to external data sources

## Links

- **Service landing page**: https://validation.rapidtools.dev
- **Manifest (v1 contract)**: https://validation.rapidtools.dev/manifest.json
- **Terms of Service**: https://validation.rapidtools.dev/terms.html
- **Documentation**: https://github.com/builder-rapidtools/rapidtools-validation

## Machine Contract

This service follows **RapidTools machine contract v1** (`schema_version: "1.0"`):

- **Capabilities**: Array of operation descriptors with `id`, `method`, `path`, `idempotent`, `side_effects`
- **Authentication**: Structured with `type`, `location`, `header_name`, `scope`
- **Limits**: Rate limits (120/min, burst 20) and payload limits (5MB, 100k rows) with `enforced: true`
- **Idempotency**: Supported via `Idempotency-Key` header, 86400s TTL with fingerprint-based conflict detection
- **Errors**: Structured format with success/error schemas, error codes, validation finding codes, and retryable codes
- **Stability**: Beta level with 30-day advance notice for breaking changes
- **Versioning**: API v1 with type versioning (csv.timeseries.ga4.v1) and 90-day deprecation notice

## API

**Base URL**: `https://rapidtools-validation-api.jamesredwards89.workers.dev`

**Authentication**: API key via `x-api-key` header (per-key scope)

**Idempotency**: Optional `Idempotency-Key` header (24h TTL, 409 on mismatch)

## Capabilities

The service exposes 3 operations (see manifest for full details):

1. **health_check** - `GET /health` - Service health and availability (no auth)
2. **list_types** - `GET /api/types` - List supported validation types
3. **validate** - `POST /api/validate` - Validate structured data

All operations are idempotent with no side effects (pure validation).

## Supported validation types

- `csv.timeseries.ga4.v1` - Google Analytics 4 CSV timeseries data

**Required headers**: `date`, `sessions`, `users`
**Optional headers**: `pageviews`

## Quick flow

1. Get API key (contact validation@rapidtools.dev)
2. Call `/api/types` to list supported validation types
3. Call `/api/validate` with type, content, and optional parameters
4. Receive validation results with findings and normalized metadata

## Example usage

See `examples/` folder for shell scripts demonstrating each endpoint:

```bash
# 1. Health check
API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev \
  ./examples/01-health.sh

# 2. List validation types
API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev \
API_KEY=your-api-key \
  ./examples/02-types.sh

# 3. Validate CSV data
API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev \
API_KEY=your-api-key \
  ./examples/03-validate.sh
```

## Response format

All endpoints follow the v1 contract error structure:

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "summary": {
      "valid": true,
      "issues": 0,
      "warnings": 0,
      "rows": 10
    },
    "findings": [],
    "normalized": {
      "detectedHeaders": ["date", "sessions", "users", "pageviews"],
      "dateRange": {
        "start": "2024-01-01",
        "end": "2024-01-10"
      }
    },
    "idempotency": {
      "key": "my-key",
      "replayed": false
    }
  }
}
```

**Validation failed (422)**:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "CSV failed validation."
  },
  "findings": [
    {
      "level": "error",
      "code": "MISSING_REQUIRED_HEADERS",
      "message": "Missing required headers: users",
      "pointer": {
        "missing": ["users"]
      }
    }
  ]
}
```

**Idempotency key reuse (409)**:

```json
{
  "ok": false,
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSE_MISMATCH",
    "message": "Idempotency key was already used with different request parameters"
  }
}
```

## Error codes

**HTTP status codes**:
- `200` - Success (validation may still have failed, check `ok` field)
- `401` - Unauthorized (missing or invalid API key)
- `404` - Not Found (endpoint doesn't exist)
- `409` - Conflict (idempotency key reused with different parameters)
- `422` - Unprocessable Entity (validation failed)
- `500` - Internal Server Error

**Application error codes**:
- `UNAUTHORIZED` - Invalid or missing API key
- `MISSING_TYPE` - Validation type not provided
- `MISSING_CONTENT` - Content not provided
- `UNSUPPORTED_TYPE` - Validation type not supported
- `VALIDATION_FAILED` - Data failed validation (see findings)
- `INVALID_CONTENT_ENCODING` - Content encoding invalid
- `IDEMPOTENCY_KEY_REUSE_MISMATCH` - Idempotency key reused incorrectly
- `INTERNAL_ERROR` - Unexpected server error (retryable)

**Validation finding codes** (csv.timeseries.ga4.v1):
- `EMPTY_CSV` - CSV file is empty
- `MISSING_REQUIRED_HEADERS` - Required headers are missing
- `INVALID_ROW_FORMAT` - Row has insufficient columns
- `INVALID_DATE_FORMAT` - Date is not in YYYY-MM-DD format
- `DUPLICATE_DATE` - Date appears multiple times
- `INVALID_SESSIONS_VALUE` - Sessions value is not a non-negative integer
- `INVALID_USERS_VALUE` - Users value is not a non-negative integer
- `INVALID_PAGEVIEWS_VALUE` - Pageviews value is not a non-negative integer
- `NOT_SORTED_BY_DATE` - Dates are not in ascending order
- `MAX_ROWS_EXCEEDED` - CSV exceeds maximum row count
- `MISSING_OPTIONAL_HEADER` - Optional header (pageviews) is missing (warning)

## Rate limits

- **Requests per minute**: 120
- **Burst allowance**: 20 requests
- **Enforcement**: Enabled
- **Scope**: Per API key

## Payload limits

- **Max CSV size**: 5,242,880 bytes (5MB)
- **Max CSV rows**: 100,000 rows
- **Enforcement**: Enabled

## Idempotency semantics

**Idempotency-Key header**: Optional client-provided key for request deduplication

**How it works**:
1. Client sends request with `Idempotency-Key` header
2. Server computes fingerprint: `sha256(type + sha256(content) + stableStringify(options) + stableStringify(context))`
3. Server stores result in KV with key: `idem:{apiKeyHash}:{idempotencyKey}:{fingerprint}`
4. Subsequent requests with same key return cached result (marked `replayed: true`)

**TTL**: 86,400 seconds (24 hours)

**Conflict detection**: If same `Idempotency-Key` is reused with different parameters, returns `409 Conflict` with error code `IDEMPOTENCY_KEY_REUSE_MISMATCH`

## Data handling

- **Storage**: Cloudflare KV (idempotency cache only, 24h TTL)
- **Retention**: Idempotency cache only (24h TTL); no data retention
- **Training use**: No

## Provider

RapidTools, United Kingdom
Contact: validation@rapidtools.dev

## License

See [Terms of Service](https://validation.rapidtools.dev/terms.html)
