---
name: posthog-cli
description: Upload sourcemaps and symbol files to PostHog error tracking with posthog-cli. Use in release/build steps that must make stack traces readable. Not for analytics queries or app instrumentation.
---

# PostHog CLI

PostHog ships `@posthog/cli` (binary: `posthog-cli`). Use it instead of hand-written API calls.

- Upload sourcemaps for error tracking: `posthog-cli sourcemap upload`
- Discover more: `posthog-cli --help`

Auth via `POSTHOG_CLI_TOKEN` (or the repo's configured env). Check the repo's build scripts — sourcemap upload is usually part of the release step.
