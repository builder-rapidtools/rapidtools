#!/bin/bash
#
# Shell wrapper for staging fixture cleanup tool
#
# Usage:
#   ./tools/cleanup-staging-fixtures.sh              # Dry-run
#   ./tools/cleanup-staging-fixtures.sh --apply      # Actually delete
#
# Required: Must be run from the backend/ directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BACKEND_DIR"

# Default staging configuration
export ENVIRONMENT="${ENVIRONMENT:-staging}"
export BASE_URL="${BASE_URL:-https://reporting-tool-api.jamesredwards89.workers.dev}"

echo "Environment: $ENVIRONMENT"
echo "Base URL: $BASE_URL"
echo ""

# Run the TypeScript tool with --staging flag always
npx ts-node --project tools/tsconfig.json tools/cleanup-staging-fixtures.ts --staging "$@"
