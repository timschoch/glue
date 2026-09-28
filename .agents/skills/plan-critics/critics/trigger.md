---
name: trigger
type: tech
activation: "trigger.dev triggerjobs task job queue retry idempotent background-job scheduled-task worker"
---

# Trigger.dev Critic

## What to check

- **Idempotency**: background jobs that write to a database or call external APIs — is the
  operation safe to run twice? (Trigger.dev retries on failure — non-idempotent jobs cause
  duplicate writes or double charges)
- **Retry strategy**: is `maxAttempts` configured? Is the retry backoff appropriate for the
  operation (aggressive retries on a rate-limited API = worse)?
- **Payload Jobs vs Trigger.dev**: which job system is used and why? Payload's built-in
  queue is simpler for CMS-adjacent work; Trigger.dev is better for long-running tasks,
  complex orchestration, or rich observability. Is the choice intentional?
- **Job naming**: task IDs — are they descriptive and unique? Colliding IDs across deploys
  can cause the wrong task handler to run
- **Error handling**: does the job have a `onFailure` handler or alerting? Silent job
  failures are hard to detect
- **Timeout**: long-running tasks — is `maxDuration` set to avoid silent cuts?
- **Secrets in job payload**: job payloads are stored and visible in the Trigger.dev
  dashboard — no secrets or PII in the payload

## Sources

- Context7: resolve `trigger.dev` or `@trigger.dev/sdk` → query for task definition,
  retry config, idempotency patterns
