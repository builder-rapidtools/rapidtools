#!/usr/bin/env npx ts-node
/**
 * Staging Fixture Cleanup Tool
 *
 * Safely removes test agencies and clients created during staging verification.
 * Contains multiple safety gates to prevent accidental production deletion.
 *
 * Usage:
 *   npx ts-node tools/cleanup-staging-fixtures.ts --staging              # Dry-run
 *   npx ts-node tools/cleanup-staging-fixtures.ts --staging --apply      # Actually delete
 *
 * Required environment:
 *   ENVIRONMENT=staging
 *   BASE_URL=<staging-url>  (must match allowlist)
 */

import { execSync } from 'child_process';
import * as readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

// KV namespace ID for reporting-tool (from wrangler.toml)
const KV_NAMESPACE_ID = '0e109d77c5934e168d98bd53f4a78772';

// Allowlisted staging domains - ONLY these can be cleaned
const STAGING_DOMAIN_ALLOWLIST = [
  'staging',
  'localhost',
  '.workers.dev',
  'preview.',
  'dev.',
  '-staging.',
  '-dev.',
];

// BLOCKED domains - refuse if BASE_URL contains any of these
const PRODUCTION_DOMAIN_BLOCKLIST = [
  'reporting-api.rapidtools.dev',
  'api.rapidtools.dev',
  'rapidtools.io',
];

// Fixture markers - records matching these patterns are eligible for deletion
const FIXTURE_MARKERS = {
  // Agency name patterns (case-insensitive)
  agencyNamePatterns: [
    /^staging\s*test/i,
    /^test\s*agency/i,
    /^dogfood/i,
    /^fixture/i,
    /^e2e[\s_-]?test/i,
  ],
  // Client name patterns (case-insensitive)
  clientNamePatterns: [
    /^staging\s*test/i,
    /^test\s*client/i,
    /^dogfood/i,
    /^fixture/i,
    /^e2e[\s_-]?test/i,
  ],
  // Email patterns (case-insensitive)
  emailPatterns: [
    /staging.*@example\.com$/i,
    /^test\d*@example\.com$/i,
    /^stagingtest\d*@example\.com$/i,
    /^e2e.*@example\.com$/i,
    /^fixture.*@example\.com$/i,
    /@test\.local$/i,
  ],
};

// ============================================================================
// TYPES
// ============================================================================

interface Agency {
  id: string;
  name: string;
  billingEmail: string;
  apiKey: string;
  subscriptionStatus: string;
  stripeCustomerId?: string;
  createdAt: string;
}

interface Client {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  createdAt: string;
}

interface DeletionPlan {
  agencies: Array<{ id: string; name: string; email: string; apiKey: string }>;
  clients: Array<{ id: string; name: string; email: string; agencyId: string }>;
  kvKeysToDelete: string[];
}

// ============================================================================
// SAFETY GATES
// ============================================================================

function checkSafetyGates(args: string[]): { staging: boolean; apply: boolean } {
  console.log('\n=== SAFETY GATE CHECKS ===\n');

  // Gate A: Check CLI flags
  const hasStaging = args.includes('--staging');
  const hasApply = args.includes('--apply');

  if (!hasStaging) {
    console.error('SAFETY GATE FAILED: --staging flag is REQUIRED');
    console.error('This tool only operates on staging environments.');
    process.exit(1);
  }
  console.log('[A] --staging flag: PASS');

  if (!hasApply) {
    console.log('[A] --apply flag: NOT SET (dry-run mode)');
  } else {
    console.log('[A] --apply flag: SET (deletion mode)');
  }

  // Gate B: Check BASE_URL environment
  const baseUrl = process.env.BASE_URL || '';

  if (!baseUrl) {
    console.error('SAFETY GATE FAILED: BASE_URL environment variable is REQUIRED');
    console.error('Set BASE_URL to the staging API URL.');
    process.exit(1);
  }

  // Check against production blocklist
  for (const blocked of PRODUCTION_DOMAIN_BLOCKLIST) {
    if (baseUrl.includes(blocked)) {
      console.error(`SAFETY GATE FAILED: BASE_URL contains blocked production domain: ${blocked}`);
      console.error('This tool CANNOT run against production.');
      process.exit(1);
    }
  }

  // Check against staging allowlist
  const matchesAllowlist = STAGING_DOMAIN_ALLOWLIST.some((pattern) => baseUrl.includes(pattern));
  if (!matchesAllowlist) {
    console.error(`SAFETY GATE FAILED: BASE_URL "${baseUrl}" does not match staging allowlist`);
    console.error('Allowed patterns:', STAGING_DOMAIN_ALLOWLIST.join(', '));
    process.exit(1);
  }
  console.log(`[B] BASE_URL allowlist: PASS (${baseUrl})`);

  // Gate C: Check ENVIRONMENT variable
  const environment = process.env.ENVIRONMENT || '';

  if (environment.toLowerCase() === 'production') {
    console.error('SAFETY GATE FAILED: ENVIRONMENT is set to "production"');
    console.error('This tool CANNOT run against production.');
    process.exit(1);
  }

  if (environment.toLowerCase() !== 'staging') {
    console.error('SAFETY GATE FAILED: ENVIRONMENT must be set to "staging"');
    console.error(`Current value: "${environment || '(not set)'}"`);
    process.exit(1);
  }
  console.log(`[C] ENVIRONMENT=staging: PASS`);

  console.log('\nAll safety gates passed.\n');

  return { staging: hasStaging, apply: hasApply };
}

// ============================================================================
// KV OPERATIONS (via wrangler CLI)
// ============================================================================

function wranglerKvList(prefix: string): string[] {
  try {
    const result = execSync(
      `npx wrangler kv:key list --namespace-id=${KV_NAMESPACE_ID} --prefix="${prefix}" 2>/dev/null`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const keys = JSON.parse(result) as Array<{ name: string }>;
    return keys.map((k) => k.name);
  } catch (error) {
    console.error(`Warning: Failed to list keys with prefix "${prefix}":`, error);
    return [];
  }
}

function wranglerKvGet(key: string): string | null {
  try {
    const result = execSync(
      `npx wrangler kv:key get --namespace-id=${KV_NAMESPACE_ID} "${key}" 2>/dev/null`,
      { encoding: 'utf-8' }
    );
    return result;
  } catch {
    return null;
  }
}

function wranglerKvDelete(key: string): boolean {
  try {
    execSync(`npx wrangler kv:key delete --namespace-id=${KV_NAMESPACE_ID} "${key}" 2>/dev/null`, {
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// FIXTURE DETECTION
// ============================================================================

function isFixtureAgency(agency: Agency): boolean {
  // Check name patterns
  for (const pattern of FIXTURE_MARKERS.agencyNamePatterns) {
    if (pattern.test(agency.name)) {
      return true;
    }
  }

  // Check email patterns
  for (const pattern of FIXTURE_MARKERS.emailPatterns) {
    if (pattern.test(agency.billingEmail)) {
      return true;
    }
  }

  return false;
}

function isFixtureClient(client: Client): boolean {
  // Check name patterns
  for (const pattern of FIXTURE_MARKERS.clientNamePatterns) {
    if (pattern.test(client.name)) {
      return true;
    }
  }

  // Check email patterns
  for (const pattern of FIXTURE_MARKERS.emailPatterns) {
    if (pattern.test(client.email)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// PLAN BUILDING
// ============================================================================

async function buildDeletionPlan(): Promise<DeletionPlan> {
  console.log('=== SCANNING FOR FIXTURES ===\n');

  const plan: DeletionPlan = {
    agencies: [],
    clients: [],
    kvKeysToDelete: [],
  };

  // Scan agencies
  console.log('Scanning agency keys...');
  const agencyKeys = wranglerKvList('agency:').filter(
    (k) => !k.includes(':clients') && !k.includes('agency_api_key:') && !k.includes('agency_stripe')
  );

  for (const key of agencyKeys) {
    const data = wranglerKvGet(key);
    if (!data) continue;

    try {
      const agency = JSON.parse(data) as Agency;
      if (isFixtureAgency(agency)) {
        plan.agencies.push({
          id: agency.id,
          name: agency.name,
          email: agency.billingEmail,
          apiKey: agency.apiKey,
        });

        // Add related keys
        plan.kvKeysToDelete.push(`agency:${agency.id}`);
        plan.kvKeysToDelete.push(`agency_api_key:${agency.apiKey}`);
        plan.kvKeysToDelete.push(`agency:${agency.id}:clients`);

        if (agency.stripeCustomerId) {
          plan.kvKeysToDelete.push(`agency_stripe_customer:${agency.stripeCustomerId}`);
        }
      }
    } catch {
      // Skip unparseable entries
    }
  }
  console.log(`  Found ${plan.agencies.length} fixture agencies`);

  // Scan clients
  console.log('Scanning client keys...');
  const clientKeys = wranglerKvList('client:').filter(
    (k) => !k.includes(':integration') && !k.includes(':reports')
  );

  for (const key of clientKeys) {
    const data = wranglerKvGet(key);
    if (!data) continue;

    try {
      const client = JSON.parse(data) as Client;
      if (isFixtureClient(client)) {
        plan.clients.push({
          id: client.id,
          name: client.name,
          email: client.email,
          agencyId: client.agencyId,
        });

        // Add related keys
        plan.kvKeysToDelete.push(`client:${client.id}`);
        plan.kvKeysToDelete.push(`client:${client.id}:integration`);
        plan.kvKeysToDelete.push(`client:${client.id}:reports`);
      }
    } catch {
      // Skip unparseable entries
    }
  }
  console.log(`  Found ${plan.clients.length} fixture clients`);

  // Deduplicate keys
  plan.kvKeysToDelete = [...new Set(plan.kvKeysToDelete)];

  return plan;
}

// ============================================================================
// OUTPUT
// ============================================================================

function printDeletionPlan(plan: DeletionPlan): void {
  console.log('\n=== DELETION PLAN ===\n');

  console.log('SUMMARY:');
  console.log(`  Agencies to delete: ${plan.agencies.length}`);
  console.log(`  Clients to delete:  ${plan.clients.length}`);
  console.log(`  Total KV keys:      ${plan.kvKeysToDelete.length}`);

  if (plan.agencies.length > 0) {
    console.log('\nAGENCIES (sample, up to 10):');
    for (const agency of plan.agencies.slice(0, 10)) {
      console.log(`  - ${agency.id}: "${agency.name}" <${agency.email}>`);
    }
    if (plan.agencies.length > 10) {
      console.log(`  ... and ${plan.agencies.length - 10} more`);
    }
  }

  if (plan.clients.length > 0) {
    console.log('\nCLIENTS (sample, up to 10):');
    for (const client of plan.clients.slice(0, 10)) {
      console.log(`  - ${client.id}: "${client.name}" <${client.email}>`);
    }
    if (plan.clients.length > 10) {
      console.log(`  ... and ${plan.clients.length - 10} more`);
    }
  }

  if (plan.kvKeysToDelete.length > 0) {
    console.log('\nKV KEY PREFIXES:');
    const prefixes = new Set(plan.kvKeysToDelete.map((k) => k.split(':')[0] + ':'));
    for (const prefix of prefixes) {
      const count = plan.kvKeysToDelete.filter((k) => k.startsWith(prefix)).length;
      console.log(`  ${prefix}* (${count} keys)`);
    }
  }
}

// ============================================================================
// CONFIRMATION
// ============================================================================

async function requestConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n=== CONFIRMATION REQUIRED ===\n');
    console.log('To proceed with deletion, type exactly: DELETE STAGING FIXTURES');
    console.log('To cancel, press Ctrl+C or type anything else.\n');

    rl.question('Confirm: ', (answer) => {
      rl.close();
      if (answer === 'DELETE STAGING FIXTURES') {
        console.log('\nConfirmation accepted.\n');
        resolve(true);
      } else {
        console.log('\nConfirmation failed. Aborting.');
        resolve(false);
      }
    });
  });
}

// ============================================================================
// EXECUTION
// ============================================================================

async function executeDeletion(plan: DeletionPlan): Promise<void> {
  console.log('=== EXECUTING DELETION ===\n');

  let deleted = 0;
  let failed = 0;

  for (const key of plan.kvKeysToDelete) {
    process.stdout.write(`  Deleting ${key}... `);
    if (wranglerKvDelete(key)) {
      console.log('OK');
      deleted++;
    } else {
      console.log('FAILED (may not exist)');
      failed++;
    }
  }

  console.log('\n=== DELETION COMPLETE ===\n');
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Failed:  ${failed}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        STAGING FIXTURE CLEANUP TOOL                            ║');
  console.log('║        Reporting API - Test Data Removal                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);

  // Check all safety gates
  const { apply } = checkSafetyGates(args);

  // Build deletion plan
  const plan = await buildDeletionPlan();

  // Print plan
  printDeletionPlan(plan);

  if (plan.kvKeysToDelete.length === 0) {
    console.log('\nNo fixtures found matching markers. Nothing to delete.');
    process.exit(0);
  }

  if (!apply) {
    console.log('\n=== DRY-RUN MODE ===');
    console.log('No changes made. To delete, run with --apply flag.');
    process.exit(0);
  }

  // Request confirmation for apply mode
  const confirmed = await requestConfirmation();
  if (!confirmed) {
    process.exit(1);
  }

  // Execute deletion
  await executeDeletion(plan);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
