#!/bin/bash
set -euo pipefail

# Upload GA4 CSV data for a client
# Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx CSV_PATH=./data.csv ./03-upload-csv.sh

if [ -z "${API_BASE:-}" ]; then
  echo "Error: API_BASE environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx CSV_PATH=./data.csv ./03-upload-csv.sh"
  exit 1
fi

if [ -z "${API_KEY:-}" ]; then
  echo "Error: API_KEY environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx CSV_PATH=./data.csv ./03-upload-csv.sh"
  exit 1
fi

if [ -z "${CLIENT_ID:-}" ]; then
  echo "Error: CLIENT_ID environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx CSV_PATH=./data.csv ./03-upload-csv.sh"
  exit 1
fi

if [ -z "${CSV_PATH:-}" ]; then
  echo "Error: CSV_PATH environment variable is required"
  echo "Usage: API_BASE=https://... API_KEY=xxx CLIENT_ID=xxx CSV_PATH=./data.csv ./03-upload-csv.sh"
  exit 1
fi

if [ ! -f "$CSV_PATH" ]; then
  echo "Error: CSV file not found at $CSV_PATH"
  exit 1
fi

echo "Uploading CSV data..."
echo "API Base: $API_BASE"
echo "Client ID: $CLIENT_ID"
echo "CSV Path: $CSV_PATH"
echo ""

# Show first few lines of CSV for verification
echo "CSV Preview (first 3 lines):"
head -n 3 "$CSV_PATH"
echo ""

read -p "Continue with upload? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Upload cancelled"
  exit 0
fi

# Upload CSV
RESPONSE=$(curl -s -X POST "$API_BASE/api/client/$CLIENT_ID/ga4-csv" \
  -H "Content-Type: text/csv" \
  -H "x-api-key: $API_KEY" \
  --data-binary "@$CSV_PATH")

echo ""
echo "Response:"
echo "$RESPONSE" | jq .

# Check if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  ROWS=$(echo "$RESPONSE" | jq -r '.rowsProcessed')
  echo ""
  echo "✓ CSV uploaded successfully"
  echo "  Rows processed: $ROWS"
  echo ""
  echo "Next step:"
  echo "  API_BASE=$API_BASE API_KEY=<your-key> CLIENT_ID=$CLIENT_ID ./04-send-report.sh"
else
  echo ""
  echo "✗ Upload failed"
  exit 1
fi
