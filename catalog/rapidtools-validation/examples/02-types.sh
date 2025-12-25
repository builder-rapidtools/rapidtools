#!/bin/bash
set -euo pipefail

# Get list of supported validation types
# Usage: API_BASE=https://... API_KEY=your-key ./02-types.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev API_KEY=your-key ./02-types.sh"
  exit 1
fi

if [ -z "${API_KEY:-}" ]; then
  echo "Error: API_KEY environment variable is required"
  echo "Usage: API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev API_KEY=your-key ./02-types.sh"
  exit 1
fi

echo "Fetching supported validation types..."
echo "API Base: $API_BASE"
echo ""

# Call types endpoint
RESPONSE=$(curl -s -X GET "$API_BASE/api/types" \
  -H "x-api-key: $API_KEY")

echo "Response:"
echo "$RESPONSE" | jq .

# Check if request succeeded
if echo "$RESPONSE" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo ""
  echo "✓ Successfully retrieved validation types"
  echo ""
  echo "Supported types:"
  echo "$RESPONSE" | jq -r '.types[] | "  - \(.type): \(.description)"'
else
  echo ""
  echo "✗ Failed to retrieve types"
  exit 1
fi
