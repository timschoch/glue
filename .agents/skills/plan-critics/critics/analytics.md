---
name: analytics
type: tech
activation: "posthog analytics event-tracking capture identify feature-flag A/B-test pageview analytics-event tracking"
---

# Analytics Critic

## What to check

- **Event naming**: does the plan follow the established naming convention? (check existing
  events for the pattern — typically `object_action`, e.g. `product_viewed`, `quote_submitted`)
- **Property structure**: event properties — do they follow the schema used by existing events?
  Inconsistent property names break funnel analysis
- **PII in events**: are names, emails, phone numbers, or other personal data sent as event
  properties? PII must not flow into PostHog properties
- **Server vs client capture**: is the event captured server-side (`posthog-node`) or
  client-side (`posthog-js`)? Each has implications for accuracy and privacy
- **`identify` calls**: user identification — is it called at the right moment (after login,
  not on every page load)? Are the user properties minimal and PII-free?
- **Feature flags**: new feature flags — are they registered in PostHog before deploy?
  Is the fallback behaviour (flag unavailable) defined?
- **Missing instrumentation**: the plan introduces a new user-facing flow — is there a plan
  to instrument it (conversion event, funnel entry/exit)?
- **Data residency**: if the project uses PostHog EU (`eu.i.posthog.com`), new server-side
  clients must use the same host, not the default US one — check the existing client config

## Sources

- Existing events in the codebase: grep for `capture(` to learn the project's naming
  convention and property schema before judging new events
- Context7: resolve `PostHog` → query for capture, identify, feature flags, server-side SDK
