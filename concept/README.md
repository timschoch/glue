# Concept

Glue's Concept: Goals, Decisions, Insights, Facts and Guardrails, as Markdown files.

Each file is `<id>-<slug>.md`: YAML frontmatter, then a short body.

| Folder                | Id     | Required frontmatter                                                                                                                            |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `concept/goals/`      | `G<n>` | `id`, `title`, `metric`, `source` (URL)                                                                                                         |
| `concept/decisions/`  | `D<n>` | `id`, `title`, `date`, `owner`, `status` (`proposed`, `accepted`, `superseded`), `goal` (a G id), `evidence` (list of I or F ids, at least one) |
| `concept/insights/`   | `I<n>` | `id`, `title`, `date`, `source` (URL)                                                                                                           |
| `concept/facts/`      | `F<n>` | `id`, `title`, `source` (URL or repo path)                                                                                                      |
| `concept/guardrails/` | `R<n>` | `id`, `title`, `enforced_by` (what checks it, or `none yet`)                                                                                    |

A `superseded` Decision also sets `superseded_by` (a D id).

## Check

```
node scripts/check-concept.mjs
```

Fails when a record misses a required field, its id does not match its folder or file name, two records share an id, or a Decision's `goal`, `evidence` or `superseded_by` points to an id that does not exist.

Test: `node --test scripts/check-concept.test.mjs`.
