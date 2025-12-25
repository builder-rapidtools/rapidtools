#!/bin/bash
set -euo pipefail

# Generate and send a report for a client
# Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx ./04-send-report.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx ./04-send-report.sh"
  exit 1
fi

if [ -z "${API_KEY:-}" ]; then
  echo "Error: API_KEY environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx ./04-send-report.sh"
  exit 1
fi

if [ -z "${CLIENT_ID:-}" ]; then
  echo "Error: CLIENT_ID environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx ./04-send-report.sh"
  exit 1
fi

echo "Sending report..."
echo "API Base: $API_BASE"
echo "Client ID: $CLIENT_ID"
echo ""

# Send report
RESPONSE=$(curl -s -X POST "$API_BASE/api/client/$CLIENT_ID/report/send" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY")

echo ""
echo "Response:"
echo "$RESPONSE" | jq .

# Check if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  echo ""
  echo "✓ Report sent successfully"
  echo ""
  echo "The client will receive the report via email with a PDF download link."
else
  echo ""
  echo "✗ Report send failed"
  exit 1
fi
