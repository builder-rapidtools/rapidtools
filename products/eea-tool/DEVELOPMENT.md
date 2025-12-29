# EEA Development Guide

Local development setup for the Economic Event Attestation service.

## Prerequisites

- Node.js 18+
- npm
- Wrangler CLI (installed via npm)

## Setup

```bash
cd products/eea-tool
npm install
```

## Environment Configuration

Create a `.dev.vars` file in the `products/eea-tool` directory:

```bash
cat > .dev.vars << 'EOF'
EEA_SIGNING_KEY=dev-signing-secret-do-not-use-in-prod
EEA_RETENTION_DAYS=30
EOF
```

**Required variables:**
- `EEA_SIGNING_KEY`: HMAC signing key for attestation signatures
- `EEA_RETENTION_DAYS`: TTL for attestation records (default: 30)

**Note**: The `.dev.vars` file is gitignored. Never commit secrets to version control.

## Development Commands

### Run local development server

```bash
npm run dev
```

Worker starts at `http://localhost:8787`

### Type checking

```bash
npm run typecheck
```

### Deploy to production

```bash
npm run deploy
```

## Local Testing

### Health check

```bash
curl http://localhost:8787/health
```

### Create attestation (requires API key setup)

```bash
curl -X POST http://localhost:8787/attest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-dev-api-key" \
  -d '{
    "event_type": "payment",
    "occurred_at": "2024-12-27T10:30:00Z",
    "amount": "150.00",
    "currency": "GBP",
    "source_system": "stripe",
    "references": {"order_id": "ORD-001"}
  }'
```

## API Key Setup (Local Development)

For local development, you'll need to manually provision API keys in your local KV namespace. See the admin tools in `tools/generate-api-key.sh` for key generation.

## Production Deployment

See main [README.md](./README.md) for production deployment instructions, including:
- KV namespace setup
- Secret management
- API key provisioning
- Custom domain configuration
