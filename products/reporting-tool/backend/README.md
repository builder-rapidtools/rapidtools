# RapidTools Reporting Tool - Backend API

**Phase 2: PDF Generation & Email Sending**

Cloudflare Workers backend for the Automated Weekly Client Reporting Tool.

---

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript)
- **Storage:** Cloudflare KV (metadata) + R2 (CSV/PDF files)
- **Framework:** Hono (lightweight router for Workers)
- **Language:** TypeScript

---

## Prerequisites

Before running this backend locally or deploying to production, ensure you have:

1. **Node.js 18+** installed
2. **npm** or **yarn** installed
3. **Wrangler CLI** installed globally:
   ```bash
   npm install -g wrangler
   ```
4. **Cloudflare account** with Workers enabled

---

## Setup

### 1. Install Dependencies

```bash
cd ~/ai-stack/rapidtools/products/reporting-tool/backend
npm install
```

### 2. Create Cloudflare Resources

#### Create KV Namespace

```bash
wrangler kv:namespace create REPORTING_KV
```

Output will show namespace ID like:
```
{ binding = "REPORTING_KV", id = "abc123..." }
```

Copy the `id` and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "REPORTING_KV"
id = "abc123..."  # Replace with your actual ID
```

#### Create R2 Bucket

```bash
wrangler r2 bucket create rapidtools-reports
```

### 3. Configure Environment Variables

For local development, create `.dev.vars` file in the backend directory:

```bash
touch .dev.vars
```

Add the following environment variables:

```
REPORTING_ENV=dev
EMAIL_FROM_ADDRESS=reports@rapidtools.io
BASE_URL=http://localhost:8787
# EMAIL_PROVIDER_API_KEY=   # Optional: Leave commented for dev mode
```

**Environment Variables Explained:**

- `REPORTING_ENV`: Environment identifier (`dev` or `prod`)
- `EMAIL_FROM_ADDRESS`: Sender email address for reports
- `BASE_URL`: Base URL for links in emails (e.g., PDF download links)
- `EMAIL_PROVIDER_API_KEY`: (Optional) API key for email provider (Resend). If not set, emails are logged to console in **dev mode** instead of being sent.

**Note:** Stripe and auth secrets will be added in Phase 3.

---

## Running Locally

Start the development server:

```bash
npm run dev
```

This runs `wrangler dev` which starts a local Cloudflare Workers environment on `http://localhost:8787`.

---

## API Endpoints (Phase 1)

### Health Check

**GET** `/api/health`

**Response:**
```json
{
  "status": "ok",
  "env": "dev",
  "timestamp": "2025-12-07T10:30:00.000Z"
}
```

---

### Create Client

**POST** `/api/client`

**Request Body:**
```json
{
  "name": "Acme Corp",
  "email": "reports@acmecorp.com",
  "brandLogoUrl": "https://example.com/logo.png",
  "reportSchedule": "weekly"
}
```

**Response:**
```json
{
  "success": true,
  "client": {
    "id": "uuid-here",
    "agencyId": "dev-agency",
    "name": "Acme Corp",
    "email": "reports@acmecorp.com",
    "brandLogoUrl": "https://example.com/logo.png",
    "reportSchedule": "weekly",
    "createdAt": "2025-12-07T10:30:00.000Z"
  }
}
```

---

### List Clients

**GET** `/api/clients`

**Response:**
```json
{
  "success": true,
  "clients": [
    {
      "id": "uuid-1",
      "agencyId": "dev-agency",
      "name": "Acme Corp",
      "email": "reports@acmecorp.com",
      "reportSchedule": "weekly",
      "createdAt": "2025-12-07T10:30:00.000Z"
    }
  ]
}
```

---

### Delete Client

**DELETE** `/api/client/:id`

**Response:**
```json
{
  "success": true
}
```

---

### Upload GA4 CSV

**POST** `/api/client/:id/ga4-csv`

**Request Body:** Raw CSV text

**Expected CSV format:**
```csv
date,sessions,users,pageviews,page_path,page_views
2025-12-01,150,120,450,/home,200
2025-12-01,150,120,450,/about,100
2025-12-02,180,140,520,/home,250
```

**Response:**
```json
{
  "success": true,
  "uploadedAt": "2025-12-07T10:35:00.000Z",
  "rowsProcessed": 3
}
```

---

### Report Preview

**POST** `/api/client/:id/report/preview`

**Response:**
```json
{
  "success": true,
  "preview": {
    "client": {
      "id": "uuid-here",
      "name": "Acme Corp",
      "email": "reports@acmecorp.com"
    },
    "metrics": {
      "periodStart": "2025-12-01",
      "periodEnd": "2025-12-07",
      "sessions": 1200,
      "users": 950,
      "pageviews": 3500,
      "topPages": [
        { "path": "/home", "pageviews": 1200 },
        { "path": "/about", "pageviews": 800 }
      ]
    },
    "generatedAt": "2025-12-07T10:40:00.000Z"
  }
}
```

---

### Report Send (Phase 2: Full Implementation)

**POST** `/api/client/:id/report/send`

Generates a branded PDF report and sends it via email.

**Response (Dev Mode - no EMAIL_PROVIDER_API_KEY set):**
```json
{
  "success": true,
  "clientId": "uuid-here",
  "sentTo": "reports@acmecorp.com",
  "pdfKey": "reports/dev-agency/uuid-here/2025-12-07T10-45-00-000Z.pdf",
  "pdfSizeBytes": 45230,
  "devMode": true,
  "sentAt": "2025-12-07T10:45:00.000Z"
}
```

**Response (Production Mode - with EMAIL_PROVIDER_API_KEY):**
```json
{
  "success": true,
  "clientId": "uuid-here",
  "sentTo": "reports@acmecorp.com",
  "pdfKey": "reports/dev-agency/uuid-here/2025-12-07T10-45-00-000Z.pdf",
  "pdfSizeBytes": 45230,
  "devMode": false,
  "provider": "resend",
  "messageId": "msg_abc123",
  "sentAt": "2025-12-07T10:45:00.000Z"
}
```

**Dev Mode Behavior:**

When `EMAIL_PROVIDER_API_KEY` is not set in `.dev.vars`, the endpoint will:
1. Generate the PDF and store it in R2
2. Log the email content to the console (visible in `wrangler dev` output)
3. Return `devMode: true` in the response
4. NOT actually send an email

This allows full testing of the report generation flow without requiring email credentials.

---

## Testing the API

### Using curl

**Health check:**
```bash
curl http://localhost:8787/api/health
```

**Create client:**
```bash
curl -X POST http://localhost:8787/api/client \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "email": "test@example.com",
    "reportSchedule": "weekly"
  }'
```

**List clients:**
```bash
curl http://localhost:8787/api/clients
```

**Upload CSV:**
```bash
curl -X POST http://localhost:8787/api/client/CLIENT_ID_HERE/ga4-csv \
  -H "Content-Type: text/csv" \
  --data-binary @sample.csv
```

**Generate preview:**
```bash
curl -X POST http://localhost:8787/api/client/CLIENT_ID_HERE/report/preview
```

**Send report (Phase 2):**
```bash
curl -X POST http://localhost:8787/api/client/CLIENT_ID_HERE/report/send
```

---

## Phase 2 Testing Guide

### Complete End-to-End Test

1. **Start dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Create a test client:**
   ```bash
   curl -X POST http://localhost:8787/api/client \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Agency Client",
       "email": "client@testagency.com",
       "reportSchedule": "weekly"
     }'
   ```
   Copy the `id` from the response.

3. **Create test CSV file:**
   ```bash
   cat > ~/test-ga4.csv << 'EOF'
   date,sessions,users,pageviews,page_path,page_views
   2025-12-01,150,120,450,/home,200
   2025-12-01,150,120,450,/about,100
   2025-12-02,180,140,520,/home,250
   2025-12-02,180,140,520,/products,150
   EOF
   ```

4. **Upload CSV:**
   ```bash
   curl -X POST http://localhost:8787/api/client/CLIENT_ID/ga4-csv \
     -H "Content-Type: text/csv" \
     --data-binary @~/test-ga4.csv
   ```

5. **Generate and send report:**
   ```bash
   curl -X POST http://localhost:8787/api/client/CLIENT_ID/report/send
   ```

6. **Check console output** - You should see:
   - PDF generation progress
   - Email logged to console (in dev mode)
   - JSON response with `pdfKey` and `devMode: true`

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Cloudflare Worker entrypoint
│   ├── router.ts             # API route definitions
│   ├── types.ts              # TypeScript type definitions
│   ├── storage.ts            # KV/R2 storage abstraction
│   ├── pdf.ts                # PDF generation module (Phase 2)
│   ├── email.ts              # Email abstraction module (Phase 2)
│   └── handlers/
│       ├── health.ts         # Health check handler
│       ├── clients.ts        # Client CRUD handlers
│       ├── uploads.ts        # GA4 CSV upload handler
│       └── reports.ts        # Report generation handlers
├── package.json
├── tsconfig.json
├── wrangler.toml             # Cloudflare Workers config
├── .dev.vars                 # Local env vars (gitignored)
└── README.md
```

---

## Current Limitations (Phase 2)

- **No authentication:** All requests use hardcoded `dev-agency` ID
- **No Stripe integration:** Payment flow not implemented yet
- **No scheduling:** Cron triggers not configured yet

These features will be implemented in subsequent phases.

---

## Deployment (Production)

### 1. Set Production Secrets

```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put EMAIL_PROVIDER_API_KEY
wrangler secret put AUTH_SECRET
```

### 2. Deploy to Cloudflare

```bash
npm run deploy
```

This runs `wrangler publish` and deploys the worker to your Cloudflare account.

### 3. Configure Custom Domain

In Cloudflare dashboard:
- Workers → reporting-tool-api → Triggers
- Add custom domain (e.g. `api.rapidtools.io`)

---

## Phase 3 Roadmap

1. **Stripe Subscription Flow:** Implement agency registration and subscription handling
2. **Stripe Webhooks:** Handle subscription events (trial, active, cancelled)
3. **Authentication:** Replace hardcoded agency ID with JWT auth
4. **Cron Triggers:** Enable weekly automation with scheduled reports

---

## Troubleshooting

### KV namespace not found
- Ensure you've created the KV namespace and updated `wrangler.toml` with correct ID
- Run `wrangler kv:namespace list` to see your namespaces

### R2 bucket errors
- Verify bucket exists: `wrangler r2 bucket list`
- Ensure R2 binding in `wrangler.toml` matches bucket name

### TypeScript errors
- Run `npm run typecheck` to see full error details
- Ensure `@cloudflare/workers-types` is installed

---

**Built by RapidTools | Target: £2,000+/month MRR**
