# RapidTools Reporting

![Contract Tests](https://github.com/builder-rapidtools/reporting-api/actions/workflows/contract-tests.yml/badge.svg)

Automated weekly client reporting service that generates branded PDF reports from analytics data and delivers them via email.

## What it does

- Accepts GA4 CSV analytics exports (per client)
- Generates summary PDF reports
- Delivers reports via email + secure download link
- Supports weekly automated scheduling

## What it doesn't do

- Does not connect to GA4 directly (CSV upload required)
- Does not verify business accuracy of uploaded data (format validation only)
- Does not provide real-time analytics or dashboards

## Links

- **Service landing page**: https://reporting.rapidtools.dev
- **Manifest (v1 contract)**: https://reporting.rapidtools.dev/manifest.json
- **Terms of Service**: https://reporting.rapidtools.dev/terms.html
- **Documentation**: https://github.com/builder-rapidtools/rapidtools-reporting

## Machine Contract

This service follows **RapidTools machine contract v1** (`schema_version: "1.0"`):

- **Capabilities**: Array of operation descriptors with `id`, `method`, `path`, `idempotent`, `side_effects`
- **Authentication**: Structured with `type`, `location`, `header_name`, `scope`
- **Limits**: Rate limits (registration only: 3/hour per IP) and payload limits (5MB, 100k rows) enforced
- **Idempotency**: Optional via `Idempotency-Key` header, 86400s TTL, per-agency scope (send_report endpoint only)
- **Errors**: Structured format with success/error schemas, error codes, and retryable codes
- **Stability**: Limited testing with 30-day advance notice for breaking changes
- **Versioning**: API v1 with 90-day deprecation notice period

## API

**Base URL**: `https://reporting-tool-api.jamesredwards89.workers.dev`

**Authentication**: API key via `x-api-key` header (per-agency scope)

**Required CSV columns**: `date`, `sessions`, `users`, `pageviews`

## Capabilities

The service exposes 9 operations (see manifest for full details):

1. **health_check** - `GET /api/health` - Service health and availability
2. **create_client** - `POST /api/client` - Register new client [storage]
3. **list_clients** - `GET /api/clients` - Retrieve all clients
4. **delete_client** - `DELETE /api/client/{id}` (header: `X-Cascade-Delete: true`) - Delete client and optionally all data [storage]
5. **upload_ga4_csv** - `POST /api/client/{id}/ga4-csv` - Upload CSV data [storage]
6. **preview_report** - `POST /api/client/{id}/report/preview` - Generate preview
7. **send_report** - `POST /api/client/{id}/report/send` - Generate and send [email, storage]
8. **generate_signed_pdf_url** - `POST /api/reports/{clientId}/{filename}/signed-url` - Generate time-limited PDF download URL
9. **download_pdf** - `GET /reports/{agencyId}/{clientId}/{filename}?token=...` - Download PDF with signed token

Most operations are idempotent. `send_report` is NOT idempotent unless `Idempotency-Key` header is provided. Operations marked with `[storage]` or `[email]` indicate side effects.

**Note on delete_client**: Without `X-Cascade-Delete: true` header, only the client KV entry is deleted. R2 objects (CSVs, PDFs) remain orphaned. Use `X-Cascade-Delete: true` header to delete all associated data. Client-scoped guardrails prevent accidental agency-wide deletion.

## Quick flow

1. Register agency → receive API key
2. Create client → receive client ID
3. Upload GA4 CSV for client
4. Send report (generates PDF, sends email)

## Example usage

See `examples/` folder for shell scripts demonstrating each step:

```bash
# 1. Register agency
API_BASE=https://reporting-tool-api.jamesredwards89.workers.dev \
  ./examples/01-register-agency.sh

# 2. Create client
API_BASE=https://reporting-tool-api.jamesredwards89.workers.dev \
API_KEY=your-api-key \
  ./examples/02-create-client.sh

# 3. Upload CSV
API_BASE=https://reporting-tool-api.jamesredwards89.workers.dev \
API_KEY=your-api-key \
CLIENT_ID=client-id \
CSV_PATH=./data.csv \
  ./examples/03-upload-csv.sh

# 4. Send report
API_BASE=https://reporting-tool-api.jamesredwards89.workers.dev \
API_KEY=your-api-key \
CLIENT_ID=client-id \
  ./examples/04-send-report.sh
```

## Response format

All endpoints follow the v1 envelope structure:

**Success:**

```json
{
  "ok": true,
  "data": {
    "client": { ... },
    "nextSteps": {
      "uploadCsv": "/api/client/{id}/ga4-csv",
      "sendReport": "/api/client/{id}/report/send"
    }
  }
}
```

**Error:**

```json
{
  "ok": false,
  "error": {
    "code": "CLIENT_NOT_FOUND",
    "message": "Client with ID abc123 not found"
  }
}
```

**Health check example:**

```bash
curl https://reporting-tool-api.jamesredwards89.workers.dev/api/health
```

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "env": "prod",
    "timestamp": "2025-12-17T16:28:58.108Z"
  }
}
```

**Auth failure example:**

```bash
curl https://reporting-tool-api.jamesredwards89.workers.dev/api/clients
```

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing x-api-key header"
  }
}
```

## Error codes

**Application errors:**
- `UNAUTHORIZED` - Invalid or missing API key
- `SUBSCRIPTION_INACTIVE` - Agency subscription is not active
- `FORBIDDEN` - Insufficient permissions
- `MISSING_REQUIRED_FIELDS` - Required fields missing in request
- `INVALID_EMAIL` - Email format is invalid
- `CLIENT_NOT_FOUND` - Client ID does not exist
- `MISSING_CLIENT_ID` - Client ID parameter missing
- `INVALID_CSV` - CSV format is invalid
- `NO_DATA_UPLOADED` - No CSV data has been uploaded yet
- `DATA_NOT_FOUND` - Uploaded data not found
- `REPORT_SEND_FAILED` - Report sending failed
- `AGENCY_NOT_FOUND` - Agency not found
- `WEBHOOK_ERROR` - Webhook processing error
- `INTERNAL_ERROR` - Internal server error
- `NOT_FOUND` - Resource not found
- `IDEMPOTENCY_KEY_REUSE_MISMATCH` - Idempotency key reused with different payload
- `IDEMPOTENCY_CHECK_FAILED` - Unable to verify idempotency (storage unavailable, FRS-2)

**Note**: Clients should implement their own retry logic with appropriate backoff based on error type and use case. See [Agent Retry & Backoff](#agent-retry--backoff-frs-2) for detailed guidance.

## Rate limits

- **General API**: No rate limiting enforced (60/min documented but not implemented)
- **Agency registration**: 3 attempts per IP per hour (enforced)
- **Report generation** (`/api/client/:id/report/send`): 10 requests per client per hour (enforced, FRS-1)
- **CSV upload** (`/api/client/:id/ga4-csv`): 20 requests per client per hour (enforced, FRS-3)
- **Error code**: `RATE_LIMIT_EXCEEDED`
- **Scope**: Per IP address (registration), per client (report generation, CSV upload)
- **Observability (FRS-2)**: Rate-limited endpoints return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

**FRS-1 (2025-12-19)**: Added rate limiting to report generation endpoint to prevent economic abuse via email spam and excessive PDF generation. Limit: 10 reports per client per hour. This bounds worst-case trial abuse to £1.40 (10 emails × 14 days × £0.01/email), down from £504 without rate limiting.

**FRS-2 (2025-12-19)**: Added rate limit headers for agent observability. Agents can now programmatically determine remaining quota and reset time, enabling intelligent retry strategies. See [Agent Retry & Backoff](#agent-retry--backoff-frs-2) for usage guidance.

**FRS-3 (2025-12-19)**: Added rate limiting to CSV upload endpoint to prevent storage economic abuse via write amplification. Limit: 20 uploads per client per hour. This bounds worst-case trial storage abuse to £2.52/month (6,720 uploads × 5MB = 168GB × £0.015/GB), down from £453.60 without rate limiting (99.4% reduction).

## Payload limits

- **Max CSV size**: 5,242,880 bytes (5MB)
- **Max CSV rows**: 100,000 rows
- **Enforcement**: Enabled
- **Error codes**: `CSV_TOO_LARGE`, `CSV_TOO_MANY_ROWS`

## Idempotency

**Optional** support via `idempotency-key` header (send_report endpoint only):
- **Header name**: `idempotency-key` (lowercase canonical form, but accepts both `idempotency-key` and `Idempotency-Key` per HTTP spec)
- **Behavior without header**: NOT idempotent - duplicate requests send duplicate emails
- **Behavior with header**: Idempotent - duplicate requests return cached result
- **TTL**: 86,400 seconds (24 hours)
- **Scope**: `per_agency_per_client`
- Repeat requests with same key and payload return cached result with `replayed: true`
- Same key with different payload returns `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`

**Important**: Do not assume `send_report` is safe to retry without the header. Always provide `idempotency-key` for retry safety.

**FRS-1 (2025-12-19)**: Fixed header case sensitivity. Implementation now accepts both lowercase (`idempotency-key`) and capitalized (`Idempotency-Key`) forms to ensure compatibility with HTTP header case-insensitivity spec and diverse agent implementations.

**FRS-2 (2025-12-19)**: Idempotency check failures return `503 IDEMPOTENCY_CHECK_FAILED` (fail closed). If storage is unavailable, the request is rejected to prevent duplicates. After successful operation, storage failures are logged but do not fail the request.

**Example: First call with idempotency key**

```bash
curl -X POST "https://reporting-tool-api.jamesredwards89.workers.dev/api/client/{id}/report/send" \
  -H "x-api-key: your-api-key" \
  -H "idempotency-key: unique-key-123"
```

```json
{
  "ok": true,
  "data": {
    "clientId": "...",
    "sentTo": "client@example.com",
    "pdfKey": "...",
    "sentAt": "2025-12-17T17:00:00.000Z"
  }
}
```

**Example: Replay with same key (no duplicate email)**

```bash
curl -X POST "https://reporting-tool-api.jamesredwards89.workers.dev/api/client/{id}/report/send" \
  -H "x-api-key: your-api-key" \
  -H "idempotency-key: unique-key-123"
```

```json
{
  "ok": true,
  "data": {
    "clientId": "...",
    "sentTo": "client@example.com",
    "pdfKey": "...",
    "sentAt": "2025-12-17T17:00:00.000Z",
    "replayed": true
  }
}
```

**Example: Same key with different payload (conflict)**

```bash
curl -X POST "https://reporting-tool-api.jamesredwards89.workers.dev/api/client/different-id/report/send" \
  -H "x-api-key: your-api-key" \
  -H "idempotency-key: unique-key-123"
```

```json
{
  "ok": false,
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSE_MISMATCH",
    "message": "Idempotency key was already used with a different request payload"
  }
}
```

## Agent Retry & Backoff (FRS-2)

**For autonomous agents and retry-heavy clients:**

### Retry Safety by Endpoint

| Endpoint | Safe to Retry | Condition | Recommended Strategy |
|----------|---------------|-----------|----------------------|
| `POST /api/client/:id/report/send` | ✅ **YES** | **With** `idempotency-key` header | Exponential backoff, max 3 retries |
| `POST /api/client/:id/report/send` | ❌ **NO** | **Without** idempotency-key | Do not retry (causes duplicate emails) |
| `POST /api/reports/:clientId/:filename/signed-url` | ✅ **YES** | Always (stateless, idempotent) | Exponential backoff, max 3 retries |
| `GET /reports/:agencyId/:clientId/:filename` | ✅ **YES** | Always (read-only) | Exponential backoff |
| All other endpoints | ✅ **YES** | Check `idempotent` field in manifest | Exponential backoff |

### Rate Limit Headers (FRS-2)

Rate-limited endpoints return headers for observability:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1734567890
```

**Agent behavior on 429**:
1. Read `X-RateLimit-Reset` header (Unix timestamp)
2. Calculate `wait_seconds = reset_time - current_time`
3. Sleep until `reset_time` before retrying
4. Do not retry before window reset (waste of resources)

### Idempotency Failure Modes

**Scenario**: Storage unavailable during idempotency check

**Behavior**: `503 IDEMPOTENCY_CHECK_FAILED` (fail closed)

**Agent response**:
- Treat as temporary failure
- Retry with exponential backoff (same idempotency key)
- Max 3 retries
- If all retries fail, try without idempotency key (accept duplicate risk) OR use new key

**Example:**
```json
{
  "ok": false,
  "error": {
    "code": "IDEMPOTENCY_CHECK_FAILED",
    "message": "Unable to verify request idempotency. Please retry with a different idempotency key or without the header."
  }
}
```

### Recommended Retry Logic

```python
import time
import random

def retry_with_backoff(func, max_retries=3, base_delay=1):
    for attempt in range(max_retries):
        try:
            response = func()

            if response.status_code == 429:
                # Rate limited - wait until reset
                reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
                wait_seconds = max(0, reset_time - int(time.time()))
                print(f"Rate limited. Waiting {wait_seconds}s until reset.")
                time.sleep(wait_seconds + 1)  # +1 for safety margin
                continue

            if response.status_code >= 500:
                # Server error - exponential backoff
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                print(f"Server error. Retrying in {delay:.1f}s...")
                time.sleep(delay)
                continue

            return response  # Success or non-retryable error

        except Exception as e:
            if attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)

    raise Exception("Max retries exceeded")
```

### Error Code Retry Matrix

| Error Code | Retryable | Wait Strategy |
|------------|-----------|---------------|
| `RATE_LIMIT_EXCEEDED` | ✅ Yes | Wait until `X-RateLimit-Reset` |
| `IDEMPOTENCY_CHECK_FAILED` | ✅ Yes | Exponential backoff (3x max) |
| `IDEMPOTENCY_KEY_REUSE_MISMATCH` | ❌ No | Use different idempotency key |
| `INTERNAL_ERROR` | ✅ Yes | Exponential backoff (3x max) |
| `UNAUTHORIZED` | ❌ No | Fix API key |
| `CLIENT_NOT_FOUND` | ❌ No | Fix client ID |
| `TRIAL_EXPIRED` | ❌ No | Upgrade subscription |

## Data handling

- **Storage**: Cloudflare KV + R2
- **Retention**: CSV data and generated PDFs retained for active subscriptions
- **Training use**: No

## Provider

RapidTools, United Kingdom
Contact: reports@rapidtools.dev

## License

See [Terms of Service](https://reporting.rapidtools.dev/terms.html)
