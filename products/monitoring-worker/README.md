# RapidTools Monitoring Worker

Cloudflare Worker for monitoring RapidTools API uptime.

## What it monitors

- **Validation API**: `GET /health`
- **Reporting API**: `GET /api/health`

## How it works

- Runs every 10 minutes via cron trigger
- Checks both API health endpoints
- Sends email alerts on failures
- Uses MailChannels (free) for email delivery

## Setup

1. Install dependencies:
```bash
npm install
```

2. Deploy to Cloudflare:
```bash
npm run deploy
```

3. Configure email addresses in wrangler.toml:
   - `ALERT_EMAIL`: Where to send alerts (default: security@rapidtools.dev)
   - `ALERT_FROM`: Sender address (default: monitoring@rapidtools.dev)

## Testing

Run a manual check:
```bash
npm run dev
```

Then visit: http://localhost:8787/check

## Monitoring Schedule

- **Frequency**: Every 10 minutes
- **Alert method**: Email (via MailChannels)
- **Alert recipient**: security@rapidtools.dev

## Email Delivery

Uses MailChannels which is free for Cloudflare Workers. No API key required.

**Note**: MailChannels may require domain verification. If emails don't arrive:
1. Check Cloudflare Workers logs
2. Verify your domain is set up correctly
3. Alternative: Replace MailChannels with Resend/SendGrid in src/index.ts

## Manual trigger

The worker also exposes an HTTP endpoint for manual testing:

```bash
curl https://rapidtools-monitoring.YOUR_SUBDOMAIN.workers.dev/check
```

## Logs

View logs in Cloudflare dashboard:
- Workers & Pages → rapidtools-monitoring → Logs

## Deployment

```bash
npm run deploy
```

After deployment, the cron trigger will automatically start running every 10 minutes.
