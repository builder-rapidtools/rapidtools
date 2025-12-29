# EEA (Economic Event Attestation)

**Version:** 1.1.0
**Endpoint:** `https://eea-api.rapidtools.dev`

Deterministic attestation service for economic events. Creates cryptographically-signed records of financial events with tamper-evident properties.

## What it does

- Accepts economic event data (payments, refunds, invoices, transfers)
- Produces deterministic canonical representation (stable JSON)
- Computes SHA-256 hash of canonical form
- Generates HMAC signature for tamper-evidence
- Stores attestation record with unique ULID identifier
- Returns idempotent results (same input → same attestation)

## What it doesn't do

- Does not verify that events actually occurred
- Does not validate data correctness or business logic
- Does not initiate transactions or hold funds
- Does not perform identity verification
- Does not provide permanent archival (records expire after retention period)
- Does not connect to external systems or make outbound calls
- Does not offer fraud detection or risk scoring

## Links

- **Service endpoint**: https://eea-api.rapidtools.dev
- **Health check**: https://eea-api.rapidtools.dev/health
- **Documentation**: https://github.com/builder-rapidtools/rapidtools
- **Development**: See [DEVELOPMENT.md](./DEVELOPMENT.md)

## Service Contract

**What EEA guarantees:**
- Determinism: Same input always produces the same hash
- Idempotency: Duplicate submissions return the existing attestation
- Tamper-evidence: HMAC signature detects modification to the record
- Auditability: Every attestation is traceable via ID or hash
- No side effects: No outbound calls, no external dependencies

**What EEA does NOT guarantee:**
- Truth verification: EEA does not verify events actually occurred
- Data correctness: EEA preserves what was submitted, not what is true
- Permanent storage: Records expire after retention period (default 30 days)
- Identity verification: API keys provide access control, not identity

## Safety & Compliance Posture

Economic Event Attestation (EEA) is a post-event evidence service. It records caller-supplied economic event data after an action has completed, normalises it deterministically, computes a cryptographic fingerprint, and returns an immutable attestation record with a timestamp and schema version. EEA does not initiate transactions, hold funds, identify users, reconcile accounts, evaluate legitimacy, or make decisions. It does not verify truth or correctness of the event; it preserves what was observed and submitted at a given time. EEA functions solely as audit-grade evidence infrastructure, providing reproducible, idempotent records suitable for compliance, reporting, and dispute resolution.

**Note on immutability**: Records are stored with a TTL (default 30 days). "Immutable" means non-modifiable while retained; expired records are not retrievable and the storage slot may be reclaimed.

## API Reference

**Base URL**: `https://eea-api.rapidtools.dev`

**Authentication**: API key via `x-api-key` header (required for all endpoints except `/health`)

**Rate limits**:
- Default: 60 requests/minute per API key (configurable per key entry)
- Rate limit is enforced per API key via the `rate_limit_per_min` field in the key entry

**Payload limits**:
- Max request body: 128KB
- Max `payload` field: 64KB

### Endpoints

#### `GET /health`

Service health check (no authentication required).

**Response (200 OK):**
```json
{
  "ok": true,
  "service": "eea-tool",
  "version": "1.1.0",
  "timestamp": "2024-12-27T10:30:00Z"
}
```

#### `POST /attest`

Create an attestation for an economic event.

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <your-api-key>`

**Request body:**
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
  "payload": {},
  "evidence": {},
  "meta": {}
}
```

**Required fields:**
| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | One of: `payment`, `refund`, `invoice_issued`, `transfer`, `credit_spend`, `payout`, `adjustment` |
| `occurred_at` | string | ISO-8601 timestamp |
| `amount` | string | Monetary amount as string (e.g., `"100.00"`) |
| `currency` | string | 3-letter uppercase code (e.g., `"USD"`, `"GBP"`) |
| `source_system` | string | Identifier of originating system |
| `references` | object | Freeform object with reference IDs |

**Optional fields:**
| Field | Type | Max Size | Description |
|-------|------|----------|-------------|
| `payload` | object | 64KB | Raw provider payload |
| `evidence` | object | - | Links/IDs for evidence artifacts |
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

**Idempotent response (200 OK):**
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

#### `GET /attest/:attestation_id`

Retrieve an existing attestation by ID.

**Headers:**
- `x-api-key: <your-api-key>`

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

### Error Format

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

**Error codes:**
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

### Response Headers

All responses include:
- `x-request-id`: Unique request identifier for tracing
- `Access-Control-Allow-Origin: *`: CORS support

Rate-limited responses include:
- `Retry-After: 60`
- `X-RateLimit-Limit: <limit>`
- `X-RateLimit-Remaining: 0`

## Operational Semantics

### Idempotency

EEA implements content-based idempotency:

1. Client submits event data to `POST /attest`
2. EEA canonicalizes the event (deterministic key sorting, undefined removal)
3. EEA computes `event_hash = sha256(canonical_event)`
4. EEA checks KV for existing attestation with this hash
5. If found: returns existing attestation with `idempotent: true` flag (200 OK)
6. If not found: creates new attestation, stores in KV, returns receipt (201 Created)

**Key property**: Submitting identical event data always returns the same `attestation_id` and `event_hash`, regardless of how many times you submit.

**Retention**: Attestation records are stored with TTL (default 30 days) and automatically expire. After expiration, the same event data will create a new attestation.

### Canonicalization

Event canonicalization ensures deterministic hashing:

1. Remove `undefined` and `null` values
2. Sort object keys alphabetically (recursive)
3. Serialize to JSON with no whitespace
4. Compute SHA-256 hash of result

This ensures `{"b": 2, "a": 1}` and `{"a": 1, "b": 2}` produce identical hashes.

### Signatures

The `attestation_sig` field provides tamper-evidence via HMAC-SHA256.

**Signature payload:**
```
sig_payload = "eea.v1|{attestation_id}|{event_hash}|{attested_at}"
attestation_sig = "hmacsha256:" + hex(HMAC-SHA256(signing_key, sig_payload))
```

**What the signature proves:**
- The record has not been modified since attestation
- The attestation was created by a system holding the signing key
- The fields (`attestation_id`, `event_hash`, `attested_at`) are authentic

**What the signature does NOT prove:**
- That the event actually occurred
- That the submitted data was accurate
- That the caller was authorized to submit the event

The signature is for tamper-evidence, not for proof of truth.

## Key Management

API keys are stored as SHA-256 hashes in Cloudflare KV. Raw keys are never stored.

### Provisioning a new key (admin only)

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

### Key entry format

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

### Disabling a key

Update the KV entry with `"status": "disabled"`. The key will immediately stop working.

### Key rotation

1. Provision a new key for the client
2. Provide the new key to the client
3. After client migrates, disable the old key

## Examples

### Health check

```bash
curl https://eea-api.rapidtools.dev/health
```

### Create attestation

```bash
curl -X POST https://eea-api.rapidtools.dev/attest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "event_type": "payment",
    "occurred_at": "2024-12-27T10:30:00Z",
    "amount": "150.00",
    "currency": "GBP",
    "source_system": "stripe",
    "references": {"order_id": "ORD-001"}
  }'
```

### Fetch attestation

```bash
curl https://eea-api.rapidtools.dev/attest/<attestation_id> \
  -H "x-api-key: your-api-key"
```

### Verify signature (example in Node.js)

```javascript
const crypto = require('crypto');

function verifySignature(record, signingKey) {
  const payload = `eea.v1|${record.attestation_id}|${record.event_hash}|${record.attested_at}`;
  const expectedSig = crypto
    .createHmac('sha256', signingKey)
    .update(payload)
    .digest('hex');

  const actualSig = record.attestation_sig.replace('hmacsha256:', '');
  return actualSig === expectedSig;
}
```

## Data Handling

- **Storage**: Cloudflare KV (attestation records only)
- **Retention**: Default 30 days (configurable via `EEA_RETENTION_DAYS`)
- **Behavior after expiration**: Records are no longer retrievable
- **Training use**: No
- **Export requirement**: Export records before expiration if long-term retention is needed

## Provider

RapidTools, United Kingdom
Contact: eea@rapidtools.dev

## License

MIT

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
