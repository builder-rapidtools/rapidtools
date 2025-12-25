# RapidTools

API-first micro-services for data validation, normalization, and reporting.

## Services

| Service | Purpose | Endpoint |
|---------|---------|----------|
| **Validation API** | CSV validation | `https://validation-api.rapidtools.dev` |
| **Normalize API** | Data normalization | `https://normalize-api.rapidtools.dev` |
| **Reporting API** | PDF report generation + email delivery | `https://reporting-api.rapidtools.dev` |

## Design

- Stateless (ephemeral caches only)
- Deterministic (same input → same output)
- API-key authenticated
- Idempotency support

## Structure

```
products/
├── validation-tool/   # CSV validation service
├── normalize-tool/    # Data normalization service
├── reporting-tool/    # PDF reports + email delivery
└── monitoring-worker/ # Uptime monitoring
```

## Security

Report vulnerabilities to security@rapidtools.dev

## License

MIT
