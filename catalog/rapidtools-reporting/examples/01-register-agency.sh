#!/bin/bash
set -euo pipefail

# Register a new agency and receive an API key
# Usage: API_BASE=https://... ./01-register-agency.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://reporting-tool-api.example.workers.dev ./01-register-agency.sh"
  exit 1
fi

echo "Registering new agency..."
echo "API Base: $API_BASE"
echo ""

# Prompt for agency details
read -p "Agency name: " AGENCY_NAME
read -p "Billing email: " BILLING_EMAIL

# Register agency
RESPONSE=$(curl -s -X POST "$API_BASE/api/agency/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$AGENCY_NAME\",
    \"billingEmail\": \"$BILLING_EMAIL\"
  }")

echo ""
echo "Response:"
echo "$RESPONSE" | jq .

# Extract and display API key if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  API_KEY=$(echo "$RESPONSE" | jq -r '.agency.apiKey')
  echo ""
  echo "✓ Agency registered successfully"
  echo ""
  echo "Save this API key (it will not be shown again):"
  echo "$API_KEY"
  echo ""
  echo "Next step:"
  echo "  API_BASE=$API_BASE API_KEY=<your-key> ./02-create-client.sh"
else
  echo ""
  echo "✗ Registration failed"
  exit 1
fi
