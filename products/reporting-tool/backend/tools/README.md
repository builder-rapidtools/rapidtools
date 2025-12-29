# Reporting Tool - Development Tools

Local-only tools for development and staging management.

## cleanup-staging-fixtures

Safely removes test agencies and clients created during staging verification.

### What It Deletes

**Only** records matching fixture markers:
- Agency names starting with: "Staging Test", "Test Agency", "Dogfood", "Fixture", "E2E Test"
- Client names starting with: "Staging Test", "Test Client", "Dogfood", "Fixture", "E2E Test"
- Emails matching: `staging*@example.com`, `test*@example.com`, `stagingtest*@example.com`

Records that do **not** match these patterns are **never touched**.

### Safety Gates

The tool has multiple safety gates that must ALL pass:

1. **--staging flag required**: Must explicitly pass `--staging`
2. **BASE_URL allowlist**: URL must contain staging indicators (`.workers.dev`, `staging`, `dev.`, etc.)
3. **Production blocklist**: Refuses if URL contains `reporting-api.rapidtools.dev` or other production domains
4. **ENVIRONMENT=staging**: Environment variable must be set to `staging`
5. **Double confirmation**: Must type exactly `DELETE STAGING FIXTURES` to proceed

### Usage

```bash
# From backend/ directory

# Dry-run (shows what would be deleted, no changes made)
ENVIRONMENT=staging BASE_URL=https://reporting-tool-api.jamesredwards89.workers.dev \
  npx ts-node tools/cleanup-staging-fixtures.ts --staging

# Actually delete (with confirmation prompt)
ENVIRONMENT=staging BASE_URL=https://reporting-tool-api.jamesredwards89.workers.dev \
  npx ts-node tools/cleanup-staging-fixtures.ts --staging --apply

# Or use the shell wrapper (sets defaults)
./tools/cleanup-staging-fixtures.sh              # Dry-run
./tools/cleanup-staging-fixtures.sh --apply      # Delete
```

### Output

**Dry-run output:**
```
=== SCANNING FOR FIXTURES ===
  Found 2 fixture agencies
  Found 4 fixture clients

=== DELETION PLAN ===
SUMMARY:
  Agencies to delete: 2
  Clients to delete:  4
  Total KV keys:      18

AGENCIES (sample):
  - abc123: "Staging Test Agency" <staging-test@example.com>
  ...

=== DRY-RUN MODE ===
No changes made. To delete, run with --apply flag.
```

**Apply output:**
```
=== CONFIRMATION REQUIRED ===
To proceed with deletion, type exactly: DELETE STAGING FIXTURES

Confirm: DELETE STAGING FIXTURES

=== EXECUTING DELETION ===
  Deleting agency:abc123... OK
  Deleting agency_api_key:xyz789... OK
  ...

=== DELETION COMPLETE ===
  Deleted: 18
  Failed:  0
```

### Warning

**This tool will NOT run against production.**

It explicitly blocks:
- `reporting-api.rapidtools.dev`
- `api.rapidtools.dev`
- `rapidtools.io`

If you attempt to run against these domains, the tool will refuse and exit.
