---
name: red-team
type: universal
activation: "always"
---

# Red-Team Critic

Approaches the plan as an adversary. Where the other critics look for mistakes, this one
looks for ways the implementation could be deliberately exploited, abused, or made to fail.
Distinct from `security.md` (which runs OWASP-style checklists) — this is open-ended
adversarial thinking.

## What to check

- **Abuse scenarios**: how would a malicious or motivated user misuse this feature?
  Think: spammers, scrapers, competitors, disgruntled users, bots. What do they gain?
  What does the plan do to limit or detect abuse?

- **Business logic attacks**: can the feature be used in ways that cost the business money
  or undermine its integrity? (e.g. referral fraud, coupon stacking, free tier abuse,
  bulk data extraction, vote manipulation)

- **Privilege escalation paths**: can a low-privileged user chain multiple operations to
  reach data or actions they shouldn't have? Does the plan check permissions at every step,
  not just at entry?

- **Trust boundary violations**: the plan likely trusts internal services, admin users, or
  signed payloads — what happens if those are compromised or lie? Is there defence in depth,
  or does one broken assumption cascade?

- **Information leakage via side channels**: error messages that reveal internal structure,
  timing differences that reveal whether a user/email exists, enumerable IDs, verbose stack
  traces in production responses

- **Resource exhaustion**: what happens if an attacker sends this endpoint 10,000 requests?
  Is there rate limiting, pagination, a timeout, a maximum payload size? Can one user starve
  others?

- **Second-order consequences**: what does this feature enable that wasn't explicitly
  intended? Does adding X inadvertently make Y possible? Could this feature be combined
  with an existing one to create an unintended capability?

- **Data poisoning**: can a user inject data that corrupts the experience for other users?
  (stored XSS, markdown injection in shared views, search index pollution)

- **Rollback and recovery under attack**: if this feature is actively being abused when
  discovered, can it be disabled or rate-limited without a full deploy? Is there a kill
  switch or circuit breaker?

- **Assumptions about attacker knowledge**: does the plan rely on security through obscurity
  (hidden endpoints, non-public IDs, unpublished schemas)? Treat these as known.
