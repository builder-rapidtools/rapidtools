#!/bin/bash
set -euo pipefail

# Validate CSV data with idempotency support
# Usage: API_BASE=https://... API_KEY=your-key ./03-validate.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev API_KEY=your-key ./03-validate.sh"
  exit 1
fi

if [ -z "${API_KEY:-}" ]; then
  echo "Error: API_KEY environment variable is required"
  echo "Usage: API_BASE=https://rapidtools-validation-api.jamesredwards89.workers.dev API_KEY=your-key ./03-validate.sh"
  exit 1
fi

# Generate unique idempotency key
IDEMPOTENCY_KEY="demo-$(date +%s)-$$"

# Sample CSV data (GA4 format)
CSV_DATA="date,sessions,users,pageviews
2024-01-01,150,120,450
2024-01-02,200,180,600
2024-01-03,175,140,525"

echo "Validating CSV data..."
echo "API Base: $API_BASE"
echo "Idempotency Key: $IDEMPOTENCY_KEY"
echo ""
echo "CSV Data:"
echo "$CSV_DATA"
echo ""

# Call validate endpoint
RESPONSE=$(curl -s -X POST "$API_BASE/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{
    \"type\": \"csv.timeseries.ga4.v1\",
    \"content\": \"text:$CSV_DATA\",
    \"options\": {
      \"requireSortedByDateAsc\": true,
      \"allowDuplicateDates\": false
    },
    \"context\": {
      \"source\": \"catalog-example\"
    }
  }")

echo "Response:"
echo "$RESPONSE" | jq .

# Check validation result
if echo "$RESPONSE" | jq -e '.ok == true' > /dev/null 2>&1; then
  VALID=$(echo "$RESPONSE" | jq -r '.summary.valid')
  ISSUES=$(echo "$RESPONSE" | jq -r '.summary.issues')
  WARNINGS=$(echo "$RESPONSE" | jq -r '.summary.warnings')
  ROWS=$(echo "$RESPONSE" | jq -r '.summary.rows')
  REPLAYED=$(echo "$RESPONSE" | jq -r '.idempotency.replayed')

  echo ""
  if [ "$VALID" = "true" ]; then
    echo "✓ CSV validation passed"
  else
    echo "✗ CSV validation failed"
  fi

  echo ""
  echo "Summary:"
  echo "  - Valid: $VALID"
  echo "  - Issues: $ISSUES"
  echo "  - Warnings: $WARNINGS"
  echo "  - Rows: $ROWS"
  echo "  - Replayed: $REPLAYED"

  if [ "$ISSUES" != "0" ] || [ "$WARNINGS" != "0" ]; then
    echo ""
    echo "Findings:"
    echo "$RESPONSE" | jq -r '.findings[] | "  [\(.level)] \(.code): \(.message)"'
  fi

  # Demonstrate idempotency by making the same request again
  echo ""
  echo "Testing idempotency (making same request again)..."
  RESPONSE2=$(curl -s -X POST "$API_BASE/api/validate" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -d "{
      \"type\": \"csv.timeseries.ga4.v1\",
      \"content\": \"text:$CSV_DATA\",
      \"options\": {
        \"requireSortedByDateAsc\": true,
        \"allowDuplicateDates\": false
      },
      \"context\": {
        \"source\": \"catalog-example\"
      }
    }")

  REPLAYED2=$(echo "$RESPONSE2" | jq -r '.idempotency.replayed')
  echo "Second request replayed from cache: $REPLAYED2"

  if [ "$REPLAYED2" = "true" ]; then
    echo "✓ Idempotency working correctly"
  else
    echo "⚠ Idempotency may not be working as expected"
  fi
else
  echo ""
  echo "✗ Validation request failed"
  ERROR_CODE=$(echo "$RESPONSE" | jq -r '.error.code')
  ERROR_MESSAGE=$(echo "$RESPONSE" | jq -r '.error.message')
  echo "Error: $ERROR_CODE - $ERROR_MESSAGE"
  exit 1
fi
