#!/bin/bash
set -euo pipefail

# Health check endpoint (no authentication required)
# Usage: API_BASE=https://... ./01-health.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev ./01-health.sh"
  exit 1
fi

echo "Checking health of validation service..."
echo "API Base: $API_BASE"
echo ""

# Call health endpoint
RESPONSE=$(curl -s "$API_BASE/health")

echo "Response:"
echo "$RESPONSE" | jq .

# Check if service is healthy
if echo "$RESPONSE" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo ""
  echo "✓ Service is healthy"
else
  echo ""
  echo "✗ Service is not healthy"
  exit 1
fi
