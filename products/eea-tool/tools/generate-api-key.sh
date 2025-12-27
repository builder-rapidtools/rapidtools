#!/bin/bash
#
# Generate and register an EEA API key
#
# Usage:
#   ./tools/generate-api-key.sh <key_id> <plan> [description]
#
# Example:
#   ./tools/generate-api-key.sh client_acme standard "Acme Corp production key"
#
# This script:
# 1. Generates a random 64-char hex API key
# 2. Computes its SHA-256 hash
# 3. Creates a JSON entry for KV
# 4. Outputs the wrangler command to register it
#
# IMPORTANT: The raw API key is shown ONCE. Store it securely.

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <key_id> <plan> [description]"
  echo ""
  echo "Plans: free, standard, enterprise"
  echo ""
  echo "Example:"
  echo "  $0 client_acme standard \"Acme Corp API key\""
  exit 1
fi

KEY_ID="$1"
PLAN="$2"
DESCRIPTION="${3:-}"
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Set rate limits based on plan
case "$PLAN" in
  free)
    RATE_LIMIT=20
    ;;
  standard)
    RATE_LIMIT=60
    ;;
  enterprise)
    RATE_LIMIT=300
    ;;
  *)
    echo "Error: Invalid plan. Must be: free, standard, enterprise"
    exit 1
    ;;
esac

# Generate random API key (64 hex chars = 32 bytes)
RAW_KEY=$(openssl rand -hex 32)

# Compute SHA-256 hash of the key
# Handle both old format "SHA256(stdin)= hash" and new format "hash"
HASH_OUTPUT=$(printf '%s' "$RAW_KEY" | openssl dgst -sha256)
if echo "$HASH_OUTPUT" | grep -q '= '; then
  KEY_HASH=$(echo "$HASH_OUTPUT" | awk -F'= ' '{print $2}')
else
  KEY_HASH="$HASH_OUTPUT"
fi

# Create JSON entry
JSON_ENTRY=$(cat <<EOF
{"key_id":"${KEY_ID}","status":"active","plan":"${PLAN}","created_at":"${CREATED_AT}","rate_limit_per_min":${RATE_LIMIT},"description":"${DESCRIPTION}"}
EOF
)

echo ""
echo "=============================================="
echo "EEA API Key Generated"
echo "=============================================="
echo ""
echo "Key ID:      ${KEY_ID}"
echo "Plan:        ${PLAN}"
echo "Rate Limit:  ${RATE_LIMIT}/min"
echo "Created:     ${CREATED_AT}"
echo ""
echo "----------------------------------------------"
echo "RAW API KEY (store securely, shown once):"
echo ""
echo "  ${RAW_KEY}"
echo ""
echo "----------------------------------------------"
echo "Key Hash (for KV storage):"
echo ""
echo "  sha256:${KEY_HASH}"
echo ""
echo "----------------------------------------------"
echo "Register in KV with this command:"
echo ""
echo "npx wrangler kv:key put --namespace-id=8a12b5ff40604b3195865c105f9d952a \\"
echo "  \"apikeyhash:sha256:${KEY_HASH}\" \\"
echo "  '${JSON_ENTRY}'"
echo ""
echo "=============================================="
