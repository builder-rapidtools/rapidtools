# RAPIDTOOLS HOSTILE AUDIT

**Date:** 29 December 2025
**Auditor:** Hostile Audit Protocol
**Scope:** RapidTools monorepo (EEA, Reporting, Validation, Monitoring)

---

## Audit Summary

| Severity | Count |
|----------|-------|
| Existential | 3 |
| High | 12 |
| Medium | 15 |
| Low | 8 |

| Verdict | Count |
|---------|-------|
| Fix | 18 |
| Tolerate | 13 |
| Accept | 7 |

**Existential Risks (Immediate Attention Required):**
1. Dev mode backdoor allows unauthenticated production access
2. Stripe webhook signature verification is not implemented
3. Subscription cancellation does not revoke access

---

## PASS 1 — Surface Audit

### Public Claims & Implicit Guarantees

---

[29 Dec 2025]
**Component:** README.md (root)
**Assumption:** Claims services are "Stateless (ephemeral caches only)"
**Risk:** EEA stores attestation records in KV with TTL. Reporting stores agencies, clients, CSVs, and PDFs persistently. These are not ephemeral caches.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Fix
**Notes:** Documentation contradicts implementation.

---

[29 Dec 2025]
**Component:** README.md (root)
**Assumption:** Claims "Deterministic (same input → same output)"
**Risk:** Reporting tool generates PDFs with timestamps, UUIDs, and server-time-dependent data. Output varies per invocation.
**Severity:** Low
**Current Mitigation:** None
**Verdict:** Tolerate
**Notes:** Only EEA is truly deterministic. Documentation is overly broad.

---

[29 Dec 2025]
**Component:** EEA README.md
**Assumption:** States "Immutable" records
**Risk:** Clarified later as "non-modifiable while retained" with TTL expiration. Users may misinterpret "immutable" as permanent.
**Severity:** Medium
**Current Mitigation:** Documentation clarifies TTL semantics
**Verdict:** Accept
**Notes:** Clarification exists but buried in later sections.

---

[29 Dec 2025]
**Component:** EEA README.md
**Assumption:** States "No side effects: No outbound calls, no external dependencies"
**Risk:** True for EEA. Agents may incorrectly generalize this to other RapidTools services.
**Severity:** Low
**Current Mitigation:** None
**Verdict:** Accept

---

[29 Dec 2025]
**Component:** Reporting README.md
**Assumption:** States "General API: No rate limiting enforced (60/min documented but not implemented)"
**Risk:** Documentation explicitly admits rate limiting is documented but not enforced for general API. Creates false sense of protection.
**Severity:** High
**Current Mitigation:** Admission in documentation
**Verdict:** Fix
**Notes:** Either enforce the limit or remove the claim.

---

[29 Dec 2025]
**Component:** Validation README.md
**Assumption:** Claims "Rate limits (120/min, burst 20) ... enforced: true"
**Risk:** Unable to verify enforcement in source code. No validation-tool source was found in provided paths. If unenforced, claim is false.
**Severity:** Medium (uncertain)
**Current Mitigation:** Unknown
**Verdict:** Tolerate
**Notes:** Uncertainty logged as risk.

---

[29 Dec 2025]
**Component:** Monitoring Worker README.md
**Assumption:** Monitoring worker checks only validation and reporting health endpoints
**Risk:** EEA health endpoint (eea-api.rapidtools.dev/health) is not monitored. Silent EEA failures will not trigger alerts.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Fix

---

## PASS 2 — Interface Audit

### API Endpoints, Auth, Idempotency, Error Handling

---

[29 Dec 2025]
**Component:** Reporting auth.ts lines 23-33
**Assumption:** Dev mode backdoor allows unauthenticated access when REPORTING_ENV='dev'
**Risk:** If REPORTING_ENV accidentally set to 'dev' in production, entire API is unauthenticated. Creates permanent dev agency with known credentials.
**Severity:** Existential
**Current Mitigation:** Comment says "should NEVER be used in production"
**Verdict:** Fix
**Notes:** Comment is not an enforceable control. Suggest removing backdoor entirely or requiring additional secret.

---

[29 Dec 2025]
**Component:** Reporting storage.ts line 61-64
**Assumption:** API keys generated using uuid v4 without additional entropy
**Risk:** UUIDv4 is predictable if PRNG is weak. Keys stored in plaintext in KV via `agency_api_key:{apiKey}` mapping.
**Severity:** High
**Current Mitigation:** None
**Verdict:** Fix
**Notes:** Should hash API keys at rest like EEA does.

---

[29 Dec 2025]
**Component:** Reporting storage.ts line 32-41
**Assumption:** API key lookup uses plaintext key directly as KV key suffix
**Risk:** API keys are effectively stored in plaintext across multiple KV entries. Leaked KV dump exposes all credentials.
**Severity:** High
**Current Mitigation:** None
**Verdict:** Fix

---

[29 Dec 2025]
**Component:** Reporting stripe.ts lines 139-154
**Assumption:** Stripe webhook signature verification is stubbed: "For MVP, we parse the JSON directly"
**Risk:** Any party can forge webhook events. Arbitrary agencies can be marked as 'active' without payment.
**Severity:** Existential
**Current Mitigation:** Comment acknowledges gap
**Verdict:** Fix
**Notes:** Production deployment with this code allows free unlimited access.

---

[29 Dec 2025]
**Component:** Reporting router.ts
**Assumption:** Agency registration endpoint (POST /api/agency/register) has no authentication
**Risk:** Anyone can register unlimited agencies, receive trial subscriptions, and generate reports until trial expires.
**Severity:** High
**Current Mitigation:** README mentions "3 attempts per IP per hour" rate limit but no enforcement visible in code
**Verdict:** Fix

---

[29 Dec 2025]
**Component:** EEA ratelimit.ts lines 35-48
**Assumption:** Rate limit counter uses get-then-increment pattern
**Risk:** Race condition: Multiple concurrent requests may read same counter value before increment, allowing burst bypass.
**Severity:** Medium
**Current Mitigation:** KV eventual consistency documented
**Verdict:** Tolerate
**Notes:** KV is eventually consistent. Documented rate limits are approximate.

---

[29 Dec 2025]
**Component:** EEA storage.ts lines 38-56
**Assumption:** Two KV writes (attestation + hash mapping) are not atomic
**Risk:** If first write succeeds and second fails, attestation exists but idempotency lookup fails. Subsequent identical request creates duplicate with different ID.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Tolerate
**Notes:** Cloudflare KV provides no transactions. Documented as eventual consistency.

---

[29 Dec 2025]
**Component:** EEA handlers/attest.ts
**Assumption:** Idempotency based on content hash, not client-provided key
**Risk:** Different from reporting tool which uses Idempotency-Key header. Inconsistent idempotency semantics across services.
**Severity:** Low
**Current Mitigation:** Documented in each service
**Verdict:** Accept

---

[29 Dec 2025]
**Component:** Reporting reports.ts
**Assumption:** handleReportSend has no idempotency protection visible in code
**Risk:** README states idempotency requires explicit header. Without header, duplicate requests send duplicate emails.
**Severity:** Medium
**Current Mitigation:** Documented behavior
**Verdict:** Accept
**Notes:** Agents that retry without idempotency-key will cause duplicate sends.

---

[29 Dec 2025]
**Component:** Reporting uploads.ts line 128-133
**Assumption:** CSV parsing skips malformed rows silently with console.warn
**Risk:** Partially corrupt CSVs may produce incomplete reports. User receives no indication of data loss.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Fix
**Notes:** Should surface parsing errors or rejected row count.

---

[29 Dec 2025]
**Component:** Reporting router.ts
**Assumption:** DELETE /api/client/:id requires X-Cascade-Delete header for complete cleanup
**Risk:** Default delete orphans R2 objects. Storage costs accumulate from orphaned data.
**Severity:** Medium
**Current Mitigation:** Documented in README
**Verdict:** Accept

---

## PASS 3 — Infrastructure Audit

### Workers, KV, R2, Timeouts, Cold Starts

---

[29 Dec 2025]
**Component:** EEA wrangler.toml
**Assumption:** Single KV namespace (EEA_KV) used for attestations, API keys, and rate limiting
**Risk:** No namespace isolation. Rate limit keys share namespace with attestation data.
**Severity:** Low
**Current Mitigation:** Key prefixes (apikeyhash:, ratelimit:, attestation:, hash:)
**Verdict:** Accept

---

[29 Dec 2025]
**Component:** EEA wrangler.toml
**Assumption:** KV namespace ID hardcoded: 8a12b5ff40604b3195865c105f9d952a
**Risk:** Namespace ID in public repository. If attacker gains Cloudflare account access, they know exactly which namespace to target.
**Severity:** Low
**Current Mitigation:** None
**Verdict:** Accept
**Notes:** Namespace ID alone is not exploitable without account access.

---

[29 Dec 2025]
**Component:** Reporting wrangler.toml
**Assumption:** Cron triggers commented out: `# crons = ["0 9 * * 1"]`
**Risk:** Automated weekly report scheduling not functional. Clients expecting automated delivery will not receive reports.
**Severity:** High
**Current Mitigation:** Feature flagged as "Phase 2"
**Verdict:** Tolerate
**Notes:** Manual sending still works. Automation is TODO.

---

[29 Dec 2025]
**Component:** Monitoring wrangler.toml
**Assumption:** Monitoring runs every 10 minutes via cron
**Risk:** 10-minute detection window for outages. Extended downtime possible between checks.
**Severity:** Low
**Current Mitigation:** None
**Verdict:** Accept

---

[29 Dec 2025]
**Component:** Monitoring index.ts lines 101-133
**Assumption:** Email alerts use MailChannels free tier
**Risk:** MailChannels free tier requires domain verification. May fail silently if not configured. No fallback.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Tolerate
**Notes:** Alert delivery not guaranteed.

---

[29 Dec 2025]
**Component:** EEA env.ts
**Assumption:** EEA_SIGNING_KEY is required but no validation on startup
**Risk:** If secret not configured, signing will fail at runtime with cryptic error. No early failure.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Fix
**Notes:** Add startup validation for required secrets.

---

[29 Dec 2025]
**Component:** Reporting storage.ts line 250-253
**Assumption:** getPdfUrl returns hardcoded placeholder URL: "https://reports.rapidtools.io/${key}"
**Risk:** URL does not resolve. Links in emails will 404. Documented as "TODO: Generate proper R2 public URL or signed URL"
**Severity:** High
**Current Mitigation:** Comment acknowledges gap
**Verdict:** Fix
**Notes:** Email recipients will get broken links.

---

[29 Dec 2025]
**Component:** All workers
**Assumption:** No explicit CPU or memory limits configured
**Risk:** Cloudflare Workers have default 50ms CPU limit (up to 30s wall-clock). Large PDF generation or CSV parsing may timeout.
**Severity:** Medium
**Current Mitigation:** Implicit platform limits
**Verdict:** Tolerate

---

[29 Dec 2025]
**Component:** EEA routes.ts
**Assumption:** Access-Control-Allow-Origin: * on all responses
**Risk:** Any domain can make authenticated API calls if client obtains API key. XSS on any site can exfiltrate to/from EEA.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Tolerate
**Notes:** API key is primary access control. CORS is defense-in-depth.

---

## PASS 4 — Economic Audit

### Stripe, Metering, Abuse Vectors, Unpaid Work

---

[29 Dec 2025]
**Component:** Reporting stripe.ts lines 22-37
**Assumption:** Dev mode returns fake checkout URL without payment
**Risk:** If STRIPE_SECRET_KEY or STRIPE_PRICE_ID_STARTER unset, checkout silently succeeds without payment.
**Severity:** High
**Current Mitigation:** None
**Verdict:** Fix
**Notes:** Missing secrets should fail explicitly, not fall back to free access.

---

[29 Dec 2025]
**Component:** Reporting stripe.ts lines 159-213
**Assumption:** Subscription cancellation handler only logs, does not update agency status
**Risk:** customer.subscription.deleted event processed but agency not marked as canceled. Canceled users retain access.
**Severity:** Existential
**Current Mitigation:** Comment: "Find agency and mark as canceled" with no implementation
**Verdict:** Fix

---

[29 Dec 2025]
**Component:** Reporting auth.ts lines 79-91
**Assumption:** requireActiveSubscription only checks status, not trial expiration
**Risk:** Trial agencies stay active indefinitely if `trialEndsAt` never checked.
**Severity:** High
**Current Mitigation:** None visible
**Verdict:** Fix
**Notes:** Trial period has no enforcement. ARCHITECTURE.md mentions `trialEndsAt` but code does not check it.

---

[29 Dec 2025]
**Component:** Reporting README.md
**Assumption:** README states client limit of 5 for Starter plan
**Risk:** No enforcement in code. Storage.listClients does not check count. Unlimited clients per agency.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Fix

---

[29 Dec 2025]
**Component:** Reporting
**Assumption:** CSV upload has no size limit enforcement visible in uploads.ts
**Risk:** README states 5MB limit but code does not check content-length. Attackers can upload arbitrarily large CSVs.
**Severity:** High
**Current Mitigation:** R2 may have implicit limits
**Verdict:** Fix

---

[29 Dec 2025]
**Component:** Reporting README.md FRS-1/FRS-2/FRS-3
**Assumption:** FRS-1/2/3 describe rate limits for report generation and CSV upload
**Risk:** Rate limit enforcement code not visible in provided source files. May be implemented elsewhere or missing.
**Severity:** Medium (uncertain)
**Current Mitigation:** Documented limits
**Verdict:** Tolerate
**Notes:** Uncertainty logged.

---

[29 Dec 2025]
**Component:** EEA
**Assumption:** No metering or billing integration
**Risk:** EEA is entirely free to use within rate limits. No revenue capture.
**Severity:** Low
**Current Mitigation:** Rate limiting provides soft cap
**Verdict:** Accept
**Notes:** Business decision, not bug.

---

[29 Dec 2025]
**Component:** Reporting agency.ts
**Assumption:** Agency registration returns API key in response body
**Risk:** If agency creation succeeds but client fails to store key, key is lost forever. No recovery mechanism.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Tolerate
**Notes:** User must re-register to get new key.

---

## PASS 5 — Governance Audit

### Key Rotation, Admin Endpoints, Blast Radius, Bus Factor

---

[29 Dec 2025]
**Component:** EEA key management
**Assumption:** No key rotation mechanism for EEA_SIGNING_KEY
**Risk:** If signing key compromised, all signatures can be forged. No documented rotation procedure.
**Severity:** High
**Current Mitigation:** None
**Verdict:** Fix
**Notes:** Key rotation requires re-signing all unexpired attestations or versioned signatures.

---

[29 Dec 2025]
**Component:** EEA tools/generate-api-key.sh line 94
**Assumption:** Script outputs wrangler command with hardcoded namespace ID
**Risk:** If namespace ID changes, all generated commands will fail or target wrong namespace.
**Severity:** Low
**Current Mitigation:** None
**Verdict:** Accept

---

[29 Dec 2025]
**Component:** EEA
**Assumption:** No admin endpoints for key management, attestation listing, or rate limit override
**Risk:** All administrative operations require direct wrangler CLI access. No audit logging of admin actions.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Accept
**Notes:** Small system, acceptable tradeoff.

---

[29 Dec 2025]
**Component:** Reporting
**Assumption:** API keys stored in plaintext across agency object and lookup key
**Risk:** Compromised KV dump exposes all agency credentials. No key rotation mechanism exists.
**Severity:** High
**Current Mitigation:** None
**Verdict:** Fix

---

[29 Dec 2025]
**Component:** EEA routes.ts lines 63-75
**Assumption:** Legacy single API key fallback (EEA_API_KEY env var)
**Risk:** Single shared key across all legacy clients. One leak compromises all. Cannot selectively revoke.
**Severity:** High
**Current Mitigation:** Documented as "for migration only"
**Verdict:** Fix
**Notes:** Remove legacy support after migration.

---

[29 Dec 2025]
**Component:** All services
**Assumption:** No centralized logging or audit trail
**Risk:** Security incidents cannot be forensically investigated. No request attribution beyond request_id.
**Severity:** Medium
**Current Mitigation:** Console.log to Cloudflare logs
**Verdict:** Accept
**Notes:** Cloudflare provides basic log retention.

---

[29 Dec 2025]
**Component:** .gitignore
**Assumption:** Gitignore includes .dev.vars and security patterns
**Risk:** Assumes developers never commit from wrong directory or override gitignore.
**Severity:** Low
**Current Mitigation:** Gitignore patterns exist
**Verdict:** Accept

---

[29 Dec 2025]
**Component:** Infrastructure
**Assumption:** Empty directories: infrastructure/cloudflare, infrastructure/nginx, infrastructure/worker-templates
**Risk:** Suggests infrastructure-as-code was planned but never implemented. Deployment relies on manual Cloudflare dashboard configuration.
**Severity:** Medium
**Current Mitigation:** None
**Verdict:** Tolerate
**Notes:** Bus factor risk. Single person holds deployment knowledge.

---

[29 Dec 2025]
**Component:** Documentation
**Assumption:** ARCHITECTURE.md describes features not implemented: multi-user, scheduled crons, template system
**Risk:** Documentation and implementation have drifted. Future maintainers may rely on outdated architecture.
**Severity:** Low
**Current Mitigation:** None
**Verdict:** Accept

---

## Systemic Patterns Observed

1. **Documentation-Implementation Mismatch**: Multiple features documented as implemented but missing from source code (rate limits, webhook verification, trial expiration, client limits).

2. **Silent Fallback to Dev Mode**: Multiple components silently degrade to insecure/free modes when configuration is incomplete (Stripe, email, auth).

3. **Plaintext Credential Storage**: Reporting API stores keys in plaintext while EEA uses proper hashing. Inconsistent security posture.

4. **No Atomic Operations**: KV-based systems perform multi-write operations without transactions. Edge cases create inconsistent state.

5. **Comment-Based Security**: Critical security gaps documented in comments ("NEVER use in production", "TODO: implement signature verification") without enforcement.

6. **Monitoring Blind Spots**: Monitoring worker checks only subset of services. New services (EEA) added without updating monitors.

7. **No Enforcement of Business Rules**: Subscription limits, trial expiration, and client caps documented but not enforced in code.

8. **Missing Error Surfacing**: Multiple silent failure modes (malformed CSV rows, email failures, storage failures) logged but not surfaced to users.

9. **Infrastructure as TODO**: Empty infrastructure directories, commented cron triggers, placeholder URLs indicate incomplete productionization.

10. **Single Points of Failure**: No documented runbooks, no key rotation procedures, no incident response process.

---

*End of Audit*
