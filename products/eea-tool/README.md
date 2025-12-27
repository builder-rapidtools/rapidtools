# EEA (Economic Event Attestation)

Deterministic attestation microservice for economic events. Creates immutable, cryptographically verifiable records of financial events.

## What It Does

EEA accepts economic events (payments, refunds, invoices, etc.) and produces:
- A **canonical representation** of the event (deterministic JSON)
- A **SHA-256 hash** of the canonical form
- An **attestation record** stored in KV with a unique ULID
- **Idempotent behavior**: submitting the same event twice returns the same attestation

## What It Guarantees

1. **Determinism**: Same input always produces the same hash
2. **Immutability**: Attestation records cannot be modified after creation
3. **Idempotency**: Duplicate submissions return the existing attestation
4. **Auditability**: Every attestation is traceable via its ID or hash
5. **No side effects**: No outbound calls, no external dependencies

## What It Does NOT Do

- ❌ Fraud detection or scoring
- ❌ Recommendations or judgement logic
- ❌ Outbound API calls
- ❌ Data export or search
- ❌ File storage (R2)
- ❌ Dashboards or UI

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
| Field | Type | Description |
|-------|------|-------------|
| `payload` | object | Raw provider payload |
| `evidence` | object | Links/IDs for evidence |
| `meta` | object | Caller metadata |

**Response (201 Created):**
```json
{
  "ok": true,
  "attestation_id": "eea_01JFNV3X9KMRQPD2VWXYZ8ABCD",
  "event_hash": "sha256:a1b2c3d4e5f6...",
  "schema_version": "eea.v1",
  "attested_at": "2024-12-27T10:30:05.123Z"
}
```

**Idempotent Response (200 OK):**
If the exact same event is submitted again:
```json
{
  "ok": true,
  "idempotent": true,
  "attestation_id": "eea_01JFNV3X9KMRQPD2VWXYZ8ABCD",
  "event_hash": "sha256:a1b2c3d4e5f6...",
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
    "canonical_event": {
      "amount": "150.00",
      "currency": "GBP",
      "event_type": "payment",
      "occurred_at": "2024-12-27T10:30:00Z",
      "references": {
        "order_id": "ORD-001",
        "stripe_payment_id": "pi_abc123"
      },
      "source_system": "stripe"
    }
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
  "version": "1.0.0",
  "timestamp": "2024-12-27T10:30:00Z"
}
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
| `NOT_FOUND` | 404 | Attestation not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Idempotency

EEA guarantees idempotent attestation:

1. When an event is submitted, it is **canonicalized** (sorted keys, no undefined)
2. A **SHA-256 hash** is computed from the canonical JSON
3. If this hash already exists in KV, the **existing attestation** is returned
4. The response includes `"idempotent": true` to indicate a duplicate

This means:
- You can safely retry failed requests
- Submitting the same event multiple times is harmless
- The hash uniquely identifies the event content

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
echo 'EEA_API_KEY=dev-test-key-12345' > .dev.vars
```

### Run Locally

```bash
npm run dev
```

Worker will start at `http://localhost:8787`

### Test Commands

**Health check:**
```bash
curl http://localhost:8787/health
```

**Create attestation:**
```bash
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
```

**Fetch attestation:**
```bash
curl http://localhost:8787/attest/eea_01JFNV3X9KMRQPD2VWXYZ8ABCD \
  -H "x-api-key: dev-test-key-12345"
```

**Test idempotency (submit same event twice):**
```bash
# First submission
curl -X POST http://localhost:8787/attest \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-test-key-12345" \
  -d '{"event_type":"refund","occurred_at":"2024-12-27T12:00:00Z","amount":"50.00","currency":"USD","source_system":"manual","references":{"refund_id":"REF-123"}}'

# Second submission (same payload) - returns idempotent: true
curl -X POST http://localhost:8787/attest \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-test-key-12345" \
  -d '{"event_type":"refund","occurred_at":"2024-12-27T12:00:00Z","amount":"50.00","currency":"USD","source_system":"manual","references":{"refund_id":"REF-123"}}'
```

**Test missing API key (should return 401):**
```bash
curl http://localhost:8787/attest/eea_test
```

**Test invalid JSON (should return 400):**
```bash
curl -X POST http://localhost:8787/attest \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-test-key-12345" \
  -d 'not valid json'
```

## Deployment

### 1. Create KV Namespace

```bash
npx wrangler kv:namespace create EEA_KV
```

Copy the ID and update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "EEA_KV"
id = "your-kv-namespace-id"
```

### 2. Set Production Secret

```bash
npx wrangler secret put EEA_API_KEY
```

### 3. Deploy

```bash
npm run deploy
```

## Architecture

```
POST /attest
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
│  Store KV   │
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
