# Glue domain language

Use these terms in code, docs, issues and UI. A new term goes here first. Layout and reading rules: [docs/agents/domain.md](docs/agents/domain.md).

## Product

| Term        | Meaning                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Company     | The customer account. Owns many Products and their users.                                                            |
| Product     | What a Glue workspace describes: an app, a website, a service. Glue holds the why for one or more Products.          |
| Concept     | The structured record of why a Product is built the way it is. The single source of truth for one Product.           |
| Version     | An immutable, numbered state of a Concept. Downstream tools read signed-off Versions only.                           |
| Goal        | A target the Product must reach, as a KPI or OKR with a metric source. Every Decision serves a Goal.                 |
| Decision    | One choice with its reason, date and owner. Serves a Goal and links to the evidence behind it.                       |
| Insight     | A finding from UX research, usage data or feedback. Evidence for Decisions.                                          |
| Fact        | A verified statement: a constraint, a number, a contract. Evidence for Decisions.                                    |
| Guardrail   | A rule every change to the Product must respect. Enforced downstream, not suggested.                                 |
| Integration | A sync with an outside tool that reads from or writes to a Concept.                                                  |
| Mock        | A stand-in for an outside tool (analytics, CRM, design system) that Glue integrates with. Lives outside Glue's code. |

## Build run

| Term         | Meaning                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Owner        | The human who owns Goals and Guardrails and signs off Versions.                                |
| Orchestrator | The agent thread that plans a run, spawns Workers, reviews and merges. Writes no product code. |
| Worker       | An agent thread that builds one ticket in its own worktree and ends with a `RESULT:` line.     |
