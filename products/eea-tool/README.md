# EEA (Economic Event Attestation)

Deterministic attestation microservice for economic events. Creates immutable, cryptographically verifiable records of financial events.

**Version:** 1.1.0
**Endpoint:** `https://eea-api.rapidtools.dev`

## What It Does

EEA accepts economic events (payments, refunds, invoices, etc.) and produces:
- A **canonical representation** of the event (deterministic JSON)
- A **SHA-256 hash** of the canonical form
- An **HMAC signature** for tamper-evidence
- An **attestation record** stored in KV with a unique ULID
- **Idempotent behavior**: submitting the same event twice returns the same attestation

## Guarantees

1. **Determinism**: Same input always produces the same hash
2. **Immutability**: Attestation records cannot be modified after creation
3. **Idempotency**: Duplicate submissions return the existing attestation
4. **Auditability**: Every attestation is traceable via its ID or hash
5. **Tamper-evidence**: HMAC signature detects any modification to the record
6. **No side effects**: No outbound calls, no external dependencies

## Non-Guarantees

- **Truth verification**: EEA does not verify that events actually occurred
- **Data correctness**: EEA preserves what was submitted, not what is true
- **Permanent storage**: Records expire after retention period (default 30 days)
- **Identity verification**: API keys are access control, not identity

## What It Does NOT Do

- ❌ Fraud detection or scoring
- ❌ Recommendations or judgement logic
- ❌ Outbound API calls
- ❌ Data export or search
- ❌ File storage (R2)
- ❌ Dashboards or UI
- ❌ Transaction initiation or fund holding
- ❌ Account reconciliation

## Regulatory Posture

Economic Event Attestation (EEA) is a post-event evidence service. It records caller-supplied economic event data after an action has completed, normalises it deterministically, computes a cryptographic fingerprint, and returns an immutable attestation record with a timestamp and schema version. EEA does not initiate transactions, hold funds, identify users, reconcile accounts, evaluate legitimacy, or make decisions. It does not verify truth or correctness of the event; it preserves what was observed and submitted at a given time. EEA functions solely as audit-grade evidence infrastructure, providing reproducible, idempotent records suitable for compliance, reporting, and dispute resolution.

## API Endpoints

### `POST /attest`

Create an attestation for an economic event.

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <your-api-key>` (required)

**Request Body:**
```json
{
  "event_type": "payment",
  "occurred_at": "2024-12-27T10:30:00Z",
  "amount": "150.00",
  "currency": "GBP",
  "source_system": "stripe",
  "references": {
    "stripe_payment_id": "pi_abc123",
    "order_id": "ORD-001"
  },
  "payload": { },
  "evidence": { },
  "meta": { }
}
```

**Required Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | One of: `payment`, `refund`, `invoice_issued`, `transfer`, `credit_spend`, `payout`, `adjustment` |
| `occurred_at` | string | ISO-8601 timestamp |
| `amount` | string | Monetary amount as string (e.g., `"100.00"`) |
| `currency` | string | 3-letter uppercase code (e.g., `"USD"`) |
| `source_system` | string | Identifier of originating system |
| `references` | object | Freeform object with reference IDs |

**Optional Fields:**
| Field | Type | Max Size | Description |
|-------|------|----------|-------------|
| `payload` | object | 64KB | Raw provider payload |
| `evidence` | object | - | Links/IDs for evidence |
| `meta` | object | - | Caller metadata |

**Response (201 Created):**
```json
{
  "ok": true,
  "attestation_id": "eea_01JFNV3X9KMRQPD2VWXYZ8ABCD",
  "event_hash": "sha256:a1b2c3d4e5f6...",
  "attestation_sig": "hmacsha256:9f8e7d6c5b4a...",
  "schema_version": "eea.v1",
  "attested_at": "2024-12-27T10:30:05.123Z"
}
```

**Idempotent Response (200 OK):**
```json
{
  "ok": true,
  "idempotent": true,
  "attestation_id": "eea_01JFNV3X9KMRQPD2VWXYZ8ABCD",
  "event_hash": "sha256:a1b2c3d4e5f6...",
  "attestation_sig": "hmacsha256:9f8e7d6c5b4a...",
  "schema_version": "eea.v1",
  "attested_at": "2024-12-27T10:30:05.123Z"
}
```

### `GET /attest/:attestation_id`

Fetch an existing attestation by ID.

**Headers:**
- `x-api-key: <your-api-key>` (required)

**Response (200 OK):**
```json
{
  "ok": true,
  "record": {
    "attestation_id": "eea_01JFNV3X9KMRQPD2VWXYZ8ABCD",
    "schema_version": "eea.v1",
    "attested_at": "2024-12-27T10:30:05.123Z",
    "event_hash": "sha256:a1b2c3d4e5f6...",
    "attestation_sig": "hmacsha256:9f8e7d6c5b4a...",
    "canonical_event": { ... }
  }
}
```

### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "ok": true,
  "service": "eea-tool",
  "version": "1.1.0",
  "timestamp": "2024-12-27T10:30:00Z"
}
```

## Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Request body | 128KB | Maximum size of entire request |
| `payload` field | 64KB | Maximum size when stringified |
| Rate limit (free) | 20/min | Requests per minute |
| Rate limit (standard) | 60/min | Requests per minute |
| Rate limit (enterprise) | 300/min | Requests per minute |

## Retention Policy

Attestation records are stored with a TTL (time-to-live) and automatically expire.

- **Default retention**: 30 days
- **Configurable via**: `EEA_RETENTION_DAYS` environment variable
- **Behavior**: After expiration, records are no longer retrievable

This means:
- EEA is not permanent archival storage
- Export records before expiration if long-term retention is needed
- Expired records cannot be recovered

## Signature Meaning

The `attestation_sig` field provides **tamper-evidence**, not proof of truth.

**What it proves:**
- The record has not been modified since attestation
- The attestation was created by a system holding the signing key
- The fields (`attestation_id`, `event_hash`, `attested_at`) are authentic

**What it does NOT prove:**
- That the event actually occurred
- That the submitted data was accurate
- That the caller was authorized to submit the event

**Signature format:**
```
sig_payload = "eea.v1|{attestation_id}|{event_hash}|{attested_at}"
attestation_sig = "hmacsha256:" + hex(HMAC-SHA256(signing_key, sig_payload))
```

## Error Format

All errors return a consistent JSON structure:

```json
{
  "ok": false,
  "error": {
    "code": "SCHEMA_VALIDATION_FAILED",
    "message": "amount must be a string representing a number",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `MISSING_REQUIRED_FIELD` | 400 | Required field is missing |
| `SCHEMA_VALIDATION_FAILED` | 400 | Field format is invalid |
| `INVALID_TIMESTAMP` | 400 | Timestamp is not valid ISO-8601 |
| `PAYLOAD_TOO_LARGE` | 413 | Request or payload exceeds size limit |
| `RATE_LIMITED` | 429 | Too many requests |
| `NOT_FOUND` | 404 | Attestation not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Response Headers

All responses include:
- `x-request-id`: Unique request identifier for tracing
- `Access-Control-Allow-Origin: *`: CORS support

Rate-limited responses also include:
- `Retry-After: 60`
- `X-RateLimit-Limit: <limit>`
- `X-RateLimit-Remaining: 0`

## API Key Management

API keys are stored as SHA-256 hashes in KV. Raw keys are never stored.

### Provisioning a New Key (Admin Only)

1. Generate a key using the admin script:
```bash
./tools/generate-api-key.sh <key_id> <plan> [description]
```

Example:
```bash
./tools/generate-api-key.sh client_acme standard "Acme Corp production key"
```

2. The script outputs:
   - The raw API key (store securely, shown once)
   - The key hash
   - The wrangler command to register it

3. Run the wrangler command to register in KV:
```bash
npx wrangler kv:key put --namespace-id=<KV_ID> \
  "apikeyhash:sha256:<hash>" \
  '{"key_id":"...","status":"active","plan":"...","created_at":"...","rate_limit_per_min":60}'
```

### Key Entry Format
```json
{
  "key_id": "client_acme",
  "status": "active",
  "plan": "standard",
  "created_at": "2025-12-27T10:00:00Z",
  "rate_limit_per_min": 60,
  "description": "Acme Corp production key"
}
```

### Disabling a Key

Update the entry in KV with `"status": "disabled"`.

## Local Development

### Prerequisites
- Node.js 18+
- Wrangler CLI

### Setup

```bash
cd ~/ai-stack/rapidtools/products/eea-tool
npm install
```

### Create `.dev.vars`

```bash
cat > .dev.vars << 'EOF'
EEA_API_KEY=dev-test-key-12345
EEA_SIGNING_KEY=dev-signing-secret-do-not-use-in-prod
EEA_RETENTION_DAYS=30
EOF
```

### Run Locally

```bash
npm run dev
```

Worker will start at `http://localhost:8787`

### Test Commands

```bash
# Health check
curl http://localhost:8787/health

# Create attestation
curl -X POST http://localhost:8787/attest \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-test-key-12345" \
  -d '{
    "event_type": "payment",
    "occurred_at": "2024-12-27T10:30:00Z",
    "amount": "150.00",
    "currency": "GBP",
    "source_system": "stripe",
    "references": {"order_id": "ORD-001"}
  }'

# Fetch attestation
curl http://localhost:8787/attest/<attestation_id> \
  -H "x-api-key: dev-test-key-12345"
```

## Deployment

### 1. Create KV Namespace (if not exists)

```bash
npx wrangler kv namespace create EEA_KV
```

Update `wrangler.toml` with the namespace ID.

### 2. Set Production Secrets

```bash
# Signing key (generate a secure random value)
openssl rand -base64 32 | npx wrangler secret put EEA_SIGNING_KEY

# Legacy API key (for migration, optional)
npx wrangler secret put EEA_API_KEY

# Retention days (optional, default 30)
echo "30" | npx wrangler secret put EEA_RETENTION_DAYS
```

### 3. Register API Keys

Use `./tools/generate-api-key.sh` to create keys and register them in KV.

### 4. Deploy

```bash
npm run deploy
```

## Architecture

```
POST /attest
    │
    ▼
┌─────────────┐
│   Auth      │──▶ 401 if invalid key
│ (KV lookup) │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Rate Limit  │──▶ 429 if exceeded
│ (KV counter)│
└─────────────┘
    │
    ▼
┌─────────────┐
│ Size Check  │──▶ 413 if too large
└─────────────┘
    │
    ▼
┌─────────────┐
│ Parse JSON  │──▶ 400 if invalid
└─────────────┘
    │
    ▼
┌─────────────┐
│  Validate   │──▶ 400 if schema error
│   Schema    │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Canonicalize│  (sort keys, remove undefined)
└─────────────┘
    │
    ▼
┌─────────────┐
│   SHA-256   │──▶ event_hash
└─────────────┘
    │
    ▼
┌─────────────┐     ┌─────────────┐
│ KV Lookup   │────▶│   Return    │  (idempotent)
│ hash:xxx    │ yes │  existing   │
└─────────────┘     └─────────────┘
    │ no
    ▼
┌─────────────┐
│ Generate    │──▶ eea_<ulid>
│   ULID      │
└─────────────┘
    │
    ▼
┌─────────────┐
│    Sign     │──▶ attestation_sig
│   (HMAC)    │
└─────────────┘
    │
    ▼
┌─────────────┐
│  Store KV   │  (with TTL)
│ attestation │
│    hash     │
└─────────────┘
    │
    ▼
┌─────────────┐
│   Return    │
│   Receipt   │
└─────────────┘
```

## License

MIT
