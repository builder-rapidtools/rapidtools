#!/bin/bash
set -euo pipefail

# Create a new client for reporting
# Usage: API_BASE=https://... API_KEY=xxx ./02-create-client.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx ./02-create-client.sh"
  exit 1
fi

if [ -z "${API_KEY:-}" ]; then
  echo "Error: API_KEY environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx ./02-create-client.sh"
  exit 1
fi

echo "Creating new client..."
echo "API Base: $API_BASE"
echo ""

# Prompt for client details
read -p "Client name: " CLIENT_NAME
read -p "Client email (for report delivery): " CLIENT_EMAIL

# Create client
RESPONSE=$(curl -s -X POST "$API_BASE/api/client" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{
    \"name\": \"$CLIENT_NAME\",
    \"email\": \"$CLIENT_EMAIL\",
    \"reportSchedule\": \"weekly\"
  }")

echo ""
echo "Response:"
echo "$RESPONSE" | jq .

# Extract and display client ID if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  CLIENT_ID=$(echo "$RESPONSE" | jq -r '.client.id')
  echo ""
  echo "✓ Client created successfully"
  echo ""
  echo "Client ID: $CLIENT_ID"
  echo ""
  echo "Next steps:"
  echo "$RESPONSE" | jq -r '.nextSteps | to_entries | .[] | "  \(.key): \(.value)"'
  echo ""
  echo "Example:"
  echo "  API_BASE=$API_BASE API_KEY=<your-key> CLIENT_ID=$CLIENT_ID CSV_PATH=./data.csv ./03-upload-csv.sh"
else
  echo ""
  echo "✗ Client creation failed"
  exit 1
fi
