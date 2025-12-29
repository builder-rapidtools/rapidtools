# RAPIDTOOLS HOSTILE AUDIT v2 — INTERACTION & DRIFT

**Date:** 29 December 2025
**Precondition:** HOSTILE_AUDIT_v1 completed and frozen
**Auditor:** Hostile Audit Protocol v2

**Audit Validity Window:**
This audit is valid until the earliest of:
- Any new endpoint added
- Any pricing or billing logic change
- Any change to rate-limiting or idempotency logic
- 90 days from audit date (29 March 2026)

---

## PASS A — Safeguard Interaction Audit

---

[29 Dec 2025]
**Pass:** A
**Component:** EEA ratelimit.ts + KV eventual consistency
**Interaction:** Rate limit uses get-then-increment pattern on eventually consistent KV. Multiple concurrent requests from coordinated agents read same counter value before any increment propagates.
**Risk:** N agents sending simultaneously can each bypass rate limit window. With 60 req/min limit, 10 coordinated agents could achieve ~600 req/min burst before counters synchronise.
**Severity:** Medium
**Current Mitigation:** None. KV eventual consistency is documented but rate limit implementation does not account for it.
**Verdict:** Tolerate
**Notes:** Mitigation would require atomic increment (not available in KV) or significant over-provisioning of limits.

---

[29 Dec 2025]
**Pass:** A
**Component:** EEA rate limiting + idempotency
**Interaction:** Idempotent requests (same payload hash) return cached attestation but still decrement rate limit counter. Agent retrying for idempotent confirmation consumes quota without creating new work.
**Risk:** Agent that retries to confirm idempotency exhausts rate limit. Subsequent non-idempotent requests fail despite no actual work being done.
**Severity:** Medium
**Current Mitigation:** None. Rate limit check occurs before idempotency check in routes.ts line 144.
**Verdict:** Fix
**Notes:** Idempotent cache hits should not consume rate limit quota.

---

[29 Dec 2025]
**Pass:** A
**Component:** EEA Retry-After header + variable rate windows
**Interaction:** Retry-After always returns 60 seconds regardless of actual remaining window time. Agent that hits rate limit at second 59 waits 60 seconds when 1 second would suffice.
**Risk:** Compliant agents over-back-off. Non-compliant agents ignore header and retry faster, gaining unfair advantage.
**Severity:** Low
**Current Mitigation:** None.
**Verdict:** Accept
**Notes:** Fixed Retry-After is simpler but rewards non-compliance.

---

[29 Dec 2025]
**Pass:** A
**Component:** EEA per-key rate limit + no global throttle
**Interaction:** Each API key has independent rate limit. Attacker can generate unlimited free-tier API keys (via generate-api-key.sh) and aggregate throughput across keys.
**Risk:** 50 free-tier keys at 20 req/min each = 1000 req/min total. No global throttle prevents coordinated swarm attack across key namespace.
**Severity:** High
**Current Mitigation:** Key generation requires wrangler CLI access. Assumes trusted key provisioning.
**Verdict:** Tolerate
**Notes:** Trust boundary is at key provisioning, not at runtime.

---

[29 Dec 2025]
**Pass:** A
**Component:** EEA attestation TTL + fetch endpoint
**Interaction:** Attestation expires via KV TTL (30 days default). GET /attest/:id returns 404 for expired attestations with same error as never-existed. Client cannot distinguish "expired" from "invalid ID".
**Risk:** Agent caching attestation IDs beyond TTL receives 404 and may incorrectly conclude attestation never existed. Audit trails become unreliable after TTL.
**Severity:** Medium
**Current Mitigation:** TTL documented in README. No distinct error code for expired vs not-found.
**Verdict:** Tolerate
**Notes:** Adding "expired" status would require TTL tracking separate from KV native TTL.

---

[29 Dec 2025]
**Pass:** A
**Component:** Reporting API + zero rate limiting
**Interaction:** Reporting API has no rate limiting implemented (V1 finding). All safeguard interaction analysis is moot because the safeguard does not exist.
**Risk:** Single agent can hammer report generation endpoint unbounded. PDF generation is CPU-intensive. Unbounded requests can exhaust worker CPU limits for all users.
**Severity:** High
**Current Mitigation:** None. README documents 60/min limit but no code enforces it.
**Verdict:** Fix
**Notes:** Cross-reference V1 finding. Elevated to interaction audit because absence of safeguard creates interaction with resource limits.

---

[29 Dec 2025]
**Pass:** A
**Component:** Monitoring worker + EEA health check absence
**Interaction:** Monitoring worker checks validation-api and reporting-api health. EEA health endpoint exists but is not monitored. EEA failure does not trigger alerts.
**Risk:** EEA can be down for extended period without alert. If Reporting depends on EEA attestations (future integration), cascading failure goes undetected.
**Severity:** Medium
**Current Mitigation:** EEA is currently independent. No cross-service dependencies.
**Verdict:** Fix
**Notes:** Monitoring worker hardcodes health check list in index.ts. New services require code changes.

---

[29 Dec 2025]
**Pass:** A
**Component:** Cross-service: Reporting + Email provider
**Interaction:** Report send endpoint calls external email provider (Resend). Email provider failure returns error. Reporting marks email as sent based on API call success, not delivery confirmation.
**Risk:** Transient email provider failure after HTTP 200 but before delivery queuing means report marked sent but never delivered. No retry mechanism. No delivery webhook integration.
**Severity:** Medium
**Current Mitigation:** Resend returns message ID which is logged but not tracked.
**Verdict:** Tolerate
**Notes:** Email delivery is inherently fire-and-forget in current architecture.

---

[29 Dec 2025]
**Pass:** A
**Component:** EEA storage + hash collision
**Interaction:** Idempotency uses SHA-256 hash of canonicalized event. Two different events producing hash collision would return wrong cached attestation.
**Risk:** SHA-256 collision probability is negligible (~2^-128) but canonicalization bugs could produce same hash for semantically different events.
**Severity:** Low
**Current Mitigation:** Canonicalization sorts keys alphabetically at all levels. Well-tested pattern.
**Verdict:** Accept
**Notes:** Theoretical risk. Canonicalization implementation reviewed in V1.

---

## PASS B — Operator Reality Audit

---

[29 Dec 2025]
**Pass:** B
**Component:** Deployment path
**Interaction:** No CI/CD pipeline exists. No .github directory. Deployment is manual `npm run deploy` (wrangler deploy/publish).
**Risk:** Tired/rushed operator deploys directly to production. No staging environment. No automated tests run pre-deploy. No approval workflow.
**Severity:** High
**Current Mitigation:** None. Manual process documented in README.
**Verdict:** Tolerate
**Notes:** Small team tradeoff. Risk increases with team size or handover.

---

[29 Dec 2025]
**Pass:** B
**Component:** Deploy command inconsistency
**Interaction:** EEA uses `wrangler deploy`, Reporting uses `wrangler publish`. Different wrangler versions may interpret these differently.
**Risk:** Operator following one service's pattern on another service may get unexpected behavior. Cognitive load increases with inconsistency.
**Severity:** Low
**Current Mitigation:** Each service has own package.json scripts.
**Verdict:** Accept
**Notes:** `wrangler publish` is deprecated alias for `wrangler deploy`. Both work but inconsistency signals drift.

---

[29 Dec 2025]
**Pass:** B
**Component:** Secret provisioning
**Interaction:** Secrets set via `wrangler secret put <NAME>`. No confirmation of which environment. No audit log of secret changes.
**Risk:** Operator sets secret on wrong worker (typo in directory). Operator overwrites production secret thinking they're in dev. No way to verify current secret value.
**Severity:** High
**Current Mitigation:** Wrangler prompts for confirmation but accepts any input.
**Verdict:** Tolerate
**Notes:** Cloudflare dashboard provides some audit trail but not for CLI operations.

---

[29 Dec 2025]
**Pass:** B
**Component:** KV namespace ID in generate-api-key.sh
**Interaction:** Script hardcodes namespace ID `8a12b5ff40604b3195865c105f9d952a`. Operator running script in different project or after namespace recreation generates command targeting wrong namespace.
**Risk:** API key registered to wrong/non-existent namespace. Key appears valid in script output but authentication fails at runtime. Silent failure.
**Severity:** Medium
**Current Mitigation:** None. Namespace ID must be manually verified.
**Verdict:** Fix
**Notes:** Script should read namespace ID from wrangler.toml or environment.

---

[29 Dec 2025]
**Pass:** B
**Component:** No rollback procedure
**Interaction:** No documented rollback procedure. No version tagging of deployments. Wrangler deployments are fire-and-forget.
**Risk:** Bad deploy requires operator to remember previous state, manually revert code, redeploy. Under incident pressure, this process is error-prone.
**Severity:** Medium
**Current Mitigation:** Cloudflare maintains deployment history in dashboard. Can rollback via UI.
**Verdict:** Tolerate
**Notes:** Rollback capability exists but is not documented or practiced.

---

[29 Dec 2025]
**Pass:** B
**Component:** Type checking not enforced
**Interaction:** `npm run typecheck` exists but is not chained to deploy. Operator can deploy type-broken code.
**Risk:** TypeScript errors caught at runtime in production instead of build time. Partial failures in deployed code.
**Severity:** Medium
**Current Mitigation:** None. Developer discipline only.
**Verdict:** Fix
**Notes:** Add `npm run typecheck && wrangler deploy` to deploy script.

---

[29 Dec 2025]
**Pass:** B
**Component:** Dev mode toggle via environment variable
**Interaction:** REPORTING_ENV='dev' enables auth bypass. Variable set via wrangler.toml or secrets. Operator debugging production may set this and forget to unset.
**Risk:** Production running with dev mode enabled indefinitely. V1 finding (Existential) re-emerges via operator error path.
**Severity:** Existential
**Current Mitigation:** Comment in code "should NEVER be used in production".
**Verdict:** Fix
**Notes:** Variable should require additional secret or be compile-time only.

---

[29 Dec 2025]
**Pass:** B
**Component:** Local development state leakage
**Interaction:** `.dev.vars` contains local secrets. If operator accidentally creates file in production path or commits to repo, secrets leak.
**Risk:** .gitignore pattern exists but can be overridden with `-f`. Previous "secret incident" (Dec 25 commit message) suggests this has already occurred.
**Severity:** High
**Current Mitigation:** .gitignore pattern. Security guardrail commit on Dec 27.
**Verdict:** Tolerate
**Notes:** Incident already occurred and was remediated. Pattern may repeat.

---

[29 Dec 2025]
**Pass:** B
**Component:** Wrangler version drift
**Interaction:** Each service has different wrangler version in package.json (3.99.0, 3.19.0, 3.87.0). Operator with global wrangler may use yet another version.
**Risk:** Version-specific behavior differences. Commands that work in one service fail in another. Debugging is complicated by version matrix.
**Severity:** Low
**Current Mitigation:** Local node_modules versions pinned per service.
**Verdict:** Accept
**Notes:** npx wrangler uses local version. Risk is when operator uses global install.

---

## PASS C — Time & Drift Audit

---

[29 Dec 2025]
**Pass:** C
**Component:** Repository age
**Interaction:** Git history shows repository created Dec 25, 2025 (4 days ago). Clean history after "secret incident". All code is effectively 4-5 days old.
**Risk:** Temporal drift audit is premature. However, temporal assumptions are already embedded that will drift. This audit documents baseline.
**Severity:** Low
**Current Mitigation:** N/A - establishing baseline.
**Verdict:** Accept
**Notes:** Re-audit at 30, 60, 90 day marks.

---

[29 Dec 2025]
**Pass:** C
**Component:** TODOs from day zero
**Interaction:** Four TODOs exist in codebase from initial commit: PDF URL generation, R2 signed URLs, PDF attachment, shared utils extraction. All are 4+ days old with no progress.
**Risk:** "Temporary" code becomes permanent behavior. Users receive broken PDF links (V1 finding). TODOs normalize as acceptable state.
**Severity:** Medium
**Current Mitigation:** None.
**Verdict:** Tolerate
**Notes:** TODOs should have target dates or be converted to tracked issues.

---

[29 Dec 2025]
**Pass:** C
**Component:** EEA_RETENTION_DAYS default
**Interaction:** Default 30-day TTL means first attestations (created ~Dec 27) expire ~Jan 26. Expiration behavior untested in production.
**Risk:** First expiration wave may surface bugs. Clients expecting permanent attestations will lose data. No warning before expiration.
**Severity:** Medium
**Current Mitigation:** TTL documented in README. No expiration notification system.
**Verdict:** Tolerate
**Notes:** Calendar reminder: audit around Jan 20 for first expiration wave.

---

[29 Dec 2025]
**Pass:** C
**Component:** Compatibility date drift
**Interaction:** EEA wrangler.toml uses `compatibility_date = "2024-12-01"`. Reporting uses `compatibility_date = "2023-12-01"`. One year difference in Cloudflare runtime behavior.
**Risk:** Services run on different Cloudflare runtime versions. Bugs fixed in newer runtime may exist in Reporting. Behavior differences between services.
**Severity:** Low
**Current Mitigation:** None.
**Verdict:** Fix
**Notes:** Standardize compatibility dates across services.

---

[29 Dec 2025]
**Pass:** C
**Component:** Package.json dependency drift
**Interaction:** @cloudflare/workers-types versions: EEA 4.20241218.0, Reporting 4.20231025.0, Monitoring 4.20241127.0. Type definitions differ by over a year.
**Risk:** TypeScript catches different errors per service. Code that type-checks in one service fails in another. Shared code patterns may not work universally.
**Severity:** Low
**Current Mitigation:** Each service is independently typed.
**Verdict:** Tolerate
**Notes:** Update on next major feature work.

---

[29 Dec 2025]
**Pass:** C
**Component:** Secret rotation cadence
**Interaction:** No documented secret rotation schedule. EEA_SIGNING_KEY, API keys, Stripe keys have no expiration or rotation procedure.
**Risk:** Compromised key remains valid indefinitely. Key in old backup/log remains usable. No forcing function for rotation.
**Severity:** High
**Current Mitigation:** None.
**Verdict:** Fix
**Notes:** Document rotation procedure. Set calendar reminder for 90-day rotation.

---

[29 Dec 2025]
**Pass:** C
**Component:** Documentation drift since V1 audit
**Interaction:** V1 audit identified doc-vs-code gaps. No documentation updates have occurred since audit (0 days elapsed).
**Risk:** Documentation drift continues. Future maintainers rely on outdated docs. Baseline established.
**Severity:** Low
**Current Mitigation:** V1 audit documents gaps.
**Verdict:** Accept
**Notes:** Track at 30-day re-audit.

---

[29 Dec 2025]
**Pass:** C
**Component:** Rate limit assumptions
**Interaction:** EEA rate limits set at initial values (free: 20, standard: 60, enterprise: 300). No usage data to validate assumptions. No adjustment mechanism.
**Risk:** Limits may be too restrictive (blocking legitimate use) or too permissive (allowing abuse). No feedback loop.
**Severity:** Low
**Current Mitigation:** Limits configurable per API key.
**Verdict:** Accept
**Notes:** Revisit after 30 days of production data.

---

[29 Dec 2025]
**Pass:** C
**Component:** Trial period enforcement
**Interaction:** V1 identified trial period has no enforcement (trialEndsAt not checked). Agency object schema includes trialEndsAt but code path ignores it.
**Risk:** Trial agencies remain active indefinitely. Over time, database accumulates non-paying "trial" users consuming resources.
**Severity:** High
**Current Mitigation:** None. V1 finding unresolved.
**Verdict:** Fix
**Notes:** Time makes this worse. Each day adds more unenforceable trials.

---

## PASS D — Economic Synchronisation Audit

---

[29 Dec 2025]
**Pass:** D
**Component:** EEA free tier + unlimited key generation
**Interaction:** Free tier allows 20 req/min per key. Key generation script has no limit. Operator can generate unlimited free keys.
**Risk:** Malicious internal actor generates 100 free keys = 2000 req/min capacity at zero cost. External attacker with wrangler access can do same.
**Severity:** Medium
**Current Mitigation:** Key generation requires Cloudflare account access.
**Verdict:** Tolerate
**Notes:** Trust boundary is correct but blast radius is large.

---

[29 Dec 2025]
**Pass:** D
**Component:** Reporting trial + no client limit enforcement
**Interaction:** Trial agencies can create unlimited clients (V1 finding). Each client can receive unlimited reports. Trial never expires (V1 finding).
**Risk:** Single trial registration → unlimited clients → unlimited PDF generation → unbounded CPU and storage cost. Perfect free-rider path.
**Severity:** Existential
**Current Mitigation:** None.
**Verdict:** Fix
**Notes:** Interaction of V1 findings creates existential economic risk.

---

[29 Dec 2025]
**Pass:** D
**Component:** PDF generation cost scaling
**Interaction:** PDF generation iterates over topPages array (up to 10 entries). Each page adds draw operations. Attacker can craft CSV with maximum pages to maximize CPU per report.
**Risk:** Attacker optimizes for expensive PDFs: 10 pages × complex paths × large numbers = maximum CPU per request. At zero rate limiting, this DoS's the worker.
**Severity:** High
**Current Mitigation:** Top pages capped at 10 in pdf.ts line 186. Page path truncated at 50 chars in line 204.
**Verdict:** Tolerate
**Notes:** Caps exist but total cost still significant. Rate limiting would bound this.

---

[29 Dec 2025]
**Pass:** D
**Component:** R2 storage accumulation
**Interaction:** CSVs and PDFs stored in R2 with no cleanup. Each report/upload adds objects. Client deletion orphans R2 objects (V1 finding).
**Risk:** Storage cost grows monotonically. Abandoned trial agencies leave permanent storage footprint. No TTL on R2 objects.
**Severity:** Medium
**Current Mitigation:** None.
**Verdict:** Tolerate
**Notes:** R2 costs are low but unbounded growth eventually becomes significant.

---

[29 Dec 2025]
**Pass:** D
**Component:** Email provider cost per send
**Interaction:** Report send triggers email via Resend. Each email has cost (~$0.001). Unlimited report sends = unlimited email cost.
**Risk:** Trial agency sending 1000 reports/day = $1/day email cost borne by platform. Coordinated abuse across many trials compounds.
**Severity:** Medium
**Current Mitigation:** Email only sent on explicit /report/send call, not automated.
**Verdict:** Tolerate
**Notes:** Rate limiting would cap this. Current manual-only trigger limits abuse vector.

---

[29 Dec 2025]
**Pass:** D
**Component:** Monitoring alert spam
**Interaction:** Monitoring worker sends email on any health check failure. Attacker can trigger failures to spam alert inbox.
**Risk:** Alert fatigue. Real alerts lost in noise. Email provider rate limits or blocks sender.
**Severity:** Low
**Current Mitigation:** Health checks run every 10 minutes. Max 144 alerts/day.
**Verdict:** Accept
**Notes:** External health check manipulation is limited attack surface.

---

[29 Dec 2025]
**Pass:** D
**Component:** Multi-agency concurrent load
**Interaction:** Multiple agencies can simultaneously send reports. No global throttle. Peak load = sum of all concurrent requests.
**Risk:** 100 agencies each sending 10 reports simultaneously = 1000 concurrent PDF generations. Worker CPU limits hit. All users experience degradation.
**Severity:** High
**Current Mitigation:** None. Cloudflare Workers have per-isolate limits but no cross-request coordination.
**Verdict:** Tolerate
**Notes:** Unlikely at current scale but architecture does not prevent.

---

[29 Dec 2025]
**Pass:** D
**Component:** Stripe webhook economic bypass
**Interaction:** V1 identified webhook signature not verified. Attacker can forge checkout.session.completed event to activate any agency without payment.
**Risk:** Combined with unlimited trial creation, attacker creates agency → forges activation webhook → gets unlimited "paid" access at zero cost.
**Severity:** Existential
**Current Mitigation:** None. V1 finding unresolved.
**Verdict:** Fix
**Notes:** Interaction of registration + webhook forgery = complete economic bypass.

---

[29 Dec 2025]
**Pass:** D
**Component:** Cheapest legal path analysis
**Interaction:** Agent optimizing for maximum value at minimum cost will: (1) register trial agency, (2) create maximum clients, (3) upload minimal CSVs, (4) generate maximum reports, (5) never convert to paid.
**Risk:** Economically rational agents will discover and exploit this path. System revenue = $0, costs = unbounded.
**Severity:** Existential
**Current Mitigation:** None.
**Verdict:** Fix
**Notes:** This is the convergent strategy for all cost-optimizing agents.

---

## Emergent Failure Patterns

1. **Safeguard Interaction Blindness**: Individual safeguards (rate limiting, idempotency) were designed in isolation. Their interaction creates edge cases not covered by either: idempotent requests consuming rate quota, expired attestations indistinguishable from invalid ones, coordinated agents bypassing per-key limits.

2. **Absent Safeguard Amplification**: Where safeguards are absent (Reporting rate limiting), the absence interacts with resource limits to create denial-of-service vectors. Missing safeguards are worse than weak safeguards because there's nothing to interact with.

3. **Operator Shortcut Paths**: Every documented process has an undocumented shortcut that a tired operator will discover: deploy without typecheck, set dev mode in production, skip secret rotation. The system has no forcing functions.

4. **Temporal Assumption Embedding**: Code written in the first week embeds assumptions (30-day TTL, compatibility dates, rate limit values) that will drift. No mechanisms exist to revisit these assumptions.

5. **Economic Collapse Convergence**: Multiple V1 findings (trial enforcement, client limits, webhook verification) interact to create a single convergent exploit path. Fixing any one in isolation still leaves the path open via the others.

6. **Trust Boundary Mismatch**: Key provisioning trusts wrangler CLI access. Runtime trusts API keys. The gap between these trust boundaries (wrangler access → unlimited keys → unlimited runtime capacity) is exploitable by insiders.

7. **Monitoring Coverage Decay**: New services (EEA) are not automatically added to monitoring. As services proliferate, monitoring coverage percentage decreases unless actively maintained.

8. **Version Entropy**: Each service was created independently with different dependency versions, compatibility dates, and wrangler versions. Entropy increases with time unless actively resisted.

---

## Post-Audit Containment Status

### Completed Fixes (29 December 2025)

| Finding | Original Verdict | Status | Implementation |
|---------|------------------|--------|----------------|
| B6: Dev mode toggle (Existential) | Fix | **RESOLVED** | Dev-mode auth bypass removed entirely from auth.ts. No environment variable can re-enable. |
| D8: Stripe webhook economic bypass (Existential) | Fix | **RESOLVED** | HMAC-SHA256 signature verification implemented in stripe.ts with replay protection (5-min timestamp tolerance). |
| D5: Trial + no client limit (Existential) | Fix | **RESOLVED** | Client count limit enforced in clients.ts (5 clients max for Starter). Trial expiration check added to auth.ts. |
| D9: Cheapest legal path (Existential) | Fix | **RESOLVED** | Blocked by combination of: trial expiration enforcement, client count limit, rate limiting. |
| C9: Trial period enforcement (High) | Fix | **RESOLVED** | requireActiveSubscription() now checks trialEndsAt and returns 402 on expiry. |
| A6: Reporting API zero rate limiting (High) | Fix | **RESOLVED** | Rate limiting middleware added to router.ts for all authenticated endpoints (60 req/min per API key). |
| V1 E4: PDF Link Reality Check (Medium) | Fix | **RESOLVED** | Signed URL generation implemented. Download endpoint with HMAC verification. Email includes 7-day valid links. |
| V1 E2: CSV upload size limit (Medium) | Fix | **RESOLVED** | 5MB limit enforced in uploads.ts with content-length check and actual body size verification. |

### Remaining Accepted/Tolerated Findings

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| A1: KV eventual consistency burst | Tolerate | Mitigation would require atomic increment not available in KV |
| A2: Idempotent requests consuming quota | Fix | *Deferred - requires refactoring request pipeline* |
| A3: Fixed Retry-After header | Accept | Simpler implementation, low impact |
| A4: Unlimited API key generation | Tolerate | Trust boundary at key provisioning is correct |
| A5: Attestation expiry indistinguishable | Tolerate | Would require separate TTL tracking |
| A7: Monitoring worker EEA absence | Fix | *Deferred - monitoring config update* |
| A8: Email delivery fire-and-forget | Tolerate | Inherent email architecture limitation |
| A9: Hash collision risk | Accept | Theoretical, SHA-256 collision negligible |
| B1: No CI/CD pipeline | Tolerate | Small team tradeoff |
| B2: Deploy command inconsistency | Accept | Both work, cosmetic |
| B3: Secret provisioning no audit | Tolerate | Cloudflare dashboard provides partial trail |
| B4: Hardcoded namespace ID | Fix | *Deferred - script update* |
| B5: No rollback procedure | Tolerate | Cloudflare UI provides rollback |
| B7: Type checking not enforced | Fix | *Deferred - deploy script update* |
| B8: .dev.vars leakage risk | Tolerate | .gitignore and prior incident response |
| B9: Wrangler version drift | Accept | Local versions pinned per service |
| C1: Repository age baseline | Accept | Baseline established |
| C2: TODOs from day zero | Tolerate | PDF TODO now resolved, others tracked |
| C3: EEA TTL first expiration | Tolerate | Calendar reminder set |
| C4: Compatibility date drift | Fix | *Deferred - standardization* |
| C5: Package.json dependency drift | Tolerate | Independent service typing |
| C6: Secret rotation cadence | Fix | *Deferred - documentation and calendar* |
| C7: Documentation drift | Accept | Tracked at re-audit |
| C8: Rate limit assumptions | Accept | Revisit after usage data |
| D1: EEA free tier key spam | Tolerate | Trust boundary correct |
| D3: PDF generation cost scaling | Tolerate | Caps exist, now rate limited |
| D4: R2 storage accumulation | Tolerate | Low cost, eventual cleanup |
| D6: Email provider cost | Tolerate | Now rate limited |
| D7: Multi-agency concurrent load | Tolerate | Unlikely at current scale |

### Emergent Patterns Status

1. **Safeguard Interaction Blindness**: Partially addressed. Rate limiting now exists for Reporting API.
2. **Absent Safeguard Amplification**: Resolved for Reporting API rate limiting.
3. **Operator Shortcut Paths**: Partially addressed. Dev-mode bypass eliminated, remaining items deferred.
4. **Temporal Assumption Embedding**: Unchanged. Baseline established.
5. **Economic Collapse Convergence**: **Resolved**. All components (trial, clients, webhook, rate limit) now enforced.
6. **Trust Boundary Mismatch**: Unchanged. Accepted risk.
7. **Monitoring Coverage Decay**: Unchanged. Deferred.
8. **Version Entropy**: Unchanged. Deferred.

---

*End of V2 Audit*

*Containment update: 29 December 2025*
