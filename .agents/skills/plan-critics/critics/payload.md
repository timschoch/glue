---
name: payload
type: tech
activation: "payload collection field hook access block global lexical richtext payload.config payloadcms"
standalone-skill: payload
---

# Payload CMS Critic

## What to check

- **Access control**: every collection and global — does the plan define `access` functions?
  Is `read`, `create`, `update`, `delete` explicitly configured? Avoid implicit public access.
- **Field hooks vs collection hooks**: using a `beforeChange` field hook where a collection
  hook would be cleaner (or vice versa)? Field hooks should be narrow; collection hooks for
  cross-field logic
- **Relationship integrity**: new relationships between collections — are `hasMany`, `depth`,
  and `maxDepth` set intentionally? Unlimited depth on a populated query = N+1 risk
- **Validation**: custom field validators — are they defined server-side (not just UI-side)?
- **Block and group fields**: blocks used where a group would suffice, or vice versa?
- **Lexical rich text**: custom nodes or features added — are they registered in both
  `payload.config.ts` and any editor config?
- **Plugin interactions**: does the plan interact with installed plugins (nested-docs,
  form-builder, redirects, SEO)? Are plugin config options compatible with the new change?
- **Migration impact**: does the plan change field types, rename fields, or remove fields?
  A corresponding migration is always needed for schema changes.
- **Type generation**: if fields are added or renamed, `payload generate:types` must be run

## Sources

- Standalone skill `payload`: load its SKILL.md for full Payload v3 guidelines
