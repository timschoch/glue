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
| Token       | A secret that opens the Concept of one Product over the HTTP API. Glue stores only its hash.                         |

## Cycle

| Term              | Meaning                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Record id         | A Concept record's id: type letter plus number, for example `D12`. Never reused, also after a discard.                                 |
| Measure           | A Goal's query, a funnel or the mean of an event property, and the run that reads it from the metric source and writes draft Insights. |
| Baseline          | The mean that the first run of a mean measure reads. The Goal's target is a change from it, for example +1 point.                      |
| Metric source     | The outside tool a measure reads, today [mock analytics](mocks/analytics/README.md). Selected per Product by its analytics project.    |
| Analytics project | The key of a Product's events in the metric source, for example `phc_flexibeck`. Set on the Product, never on a Goal.                  |
| Draft             | An Insight that nobody has triaged yet. `measure` writes drafts.                                                                       |
| Triage            | Deciding on a draft: keep it, discard it (only when no Decision cites it), or propose a Decision from it.                              |
| Supersede         | Replace an accepted Decision with a new accepted one. The old one keeps its record id and points to its successor.                     |
| Downstream issue  | The GitHub issue Glue opens in a Product's repository when a Decision becomes accepted. Names the Decision id.                         |

## User simulator

The Mock in [mocks/user-sim](mocks/user-sim/README.md). It makes the numbers a measure reads.

| Term    | Meaning                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| Bot     | A simulated user with seeded traits. Uses the deployed Product through its accessibility tree, like a person.       |
| Rule    | A behaviour model from UX research, for example choice overload. Changes what a Bot does, never tuned for a result. |
| Journey | The Steps a Bot tries in one Product, in order.                                                                     |
| Step    | One intent in a Journey, for example "accept a plan", with the accessible names to look for.                        |

## Build run

| Term         | Meaning                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Owner        | The human who owns Goals and Guardrails and signs off Versions.                                |
| Orchestrator | The agent thread that plans a run, spawns Workers, reviews and merges. Writes no product code. |
| Worker       | An agent thread that builds one ticket in its own worktree and ends with a `RESULT:` line.     |
