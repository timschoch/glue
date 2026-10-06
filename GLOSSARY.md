# Glue domain language

Use these terms in code, docs, issues and UI. A new term goes here first. Layout and reading rules: [docs/agents/domain.md](docs/agents/domain.md).

## Product

| Term        | Meaning                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company     | The customer account. Owns many Products and their users.                                                                                                 |
| Product     | What a Glue workspace describes: an app, a website, a service. Glue holds the why for one or more Products.                                               |
| Concept     | Parts assembled with glue: the why of one Product, or of one area of it. A Concept can hold smaller Concepts. Today the code has one Concept per Product. |
| Version     | An immutable, numbered state of a Part or a Concept. Downstream tools read signed-off Versions only.                                                      |
| Goal        | A target the Product must reach, as a KPI or OKR with a metric source. Every Decision serves a Goal.                                                      |
| Decision    | One choice with its reason, date and owner. Serves a Goal and needs evidence: an Insight or a Guardrail.                                                  |
| Insight     | A finding from UX research, usage data or feedback. Evidence for Decisions.                                                                               |
| Guardrail   | A rule every change to the Product must respect. Enforced downstream, not suggested. Evidence for Decisions.                                              |
| Integration | A sync with an outside tool that reads from or writes to a Concept.                                                                                       |
| Mock        | A stand-in for an outside tool (analytics, CRM, design system) that Glue integrates with. Lives outside Glue's code.                                      |
| Token       | A secret that opens the Concept of one Product over the HTTP API. Glue stores only its hash.                                                              |

## Concept model

The target model. Diagrams and rules: [docs/concept.md](docs/concept.md). The app does not have all of it yet.

| Term           | Meaning                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project        | The top level that holds Concepts: a Product, or other work such as a UX study. Today the code has only Product.                                |
| Part           | One record in a Concept. Types: Insight, Goal, Decision, Guardrail, Entity, Flow, Metric. Has one home Concept and one owner.                   |
| Owner          | The one member of the Project who answers for a Part: its Responsible. A new Part takes the member who adds it. Only the owner answers a flag.  |
| Watcher        | A member who follows a Part. Sees it in Mine in a group of its own, with its flags as a note. Not the owner.                                    |
| Entity         | A Part that names a thing the Product has, for example Technique.                                                                               |
| Flow           | A Part that says how something moves, step by step.                                                                                             |
| Metric         | A Part that says if it worked: a reading against a target.                                                                                      |
| Kind           | The slots a Concept must fill, for example Brief. A slot with no Part shows as an empty slot.                                                   |
| Brief          | A Kind of Concept that says what to build. Not a Part.                                                                                          |
| Contract       | One frozen Version of a Concept. A build names the Contract Version it was built with, and a gate checks the build against it.                  |
| Joint          | The glue between two Parts. One-way (A needs B) or two-way. Across a Concept edge it is a link, never a copy.                                   |
| Loop           | Understand, Decide, Design, Build, Use, then Understand again. Each Concept runs its own loop. A step is not a job role.                        |
| Signal         | One raw observation from an outside tool. Many Signals become few Insights.                                                                     |
| Signal source  | An outside tool that Glue reads Signals from: GitHub, support, analytics.                                                                       |
| Evidence level | How sure an Insight is: Signal, Hunch, Pattern, Confirmed.                                                                                      |
| Trust          | What a reader can rely on, shown as a light: Solid (green), Flagged (yellow), Not ready (red), Wrong (black). Only Trust travels along a Joint. |
| Work state     | What the owner of a Part has to do: To check, Waiting, Draft, Review, Published, Sunk. Not the Draft in [Cycle](#cycle).                        |
| Wording fix    | A new title or body of a Part that means the same as the old one. The member who writes it says so. It flags no Part.                           |
| Tier           | Tier 1 Parts are what a coding agent reads: Flow, Entity, Guardrail. Tier 2 Parts are the why.                                                  |
| Lens           | A filter over all Parts. It changes what you see first, never where a Part lives or who may open it.                                            |
| Flight level   | How much a view shows: Strategic (a summary) or Operational (raw details).                                                                      |
| Mine           | The app section that shows what needs you now.                                                                                                  |
| Ask            | A request to another Project to check a Hunch. A member there picks it and hands back a published Insight. The asker glues it to the Hunch.     |

## Cycle

| Term              | Meaning                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record id         | A Concept record's id: type letter plus number, for example `D12`. Never reused, also after a discard.                                                                           |
| Measure           | A Goal's query, a funnel or the mean of an event property, and the run that reads it from the metric source and new Comments from the social channel, and writes draft Insights. |
| Baseline          | The mean that the first run of a mean measure reads, or the mean of its baseline value. The Goal's target is a change from it, for example +1 point.                             |
| Baseline value    | A breakdown value a mean measure names as its baseline, for example the `app_version` before the change. The latest value is then the mean of the newest other breakdown value.  |
| Metric source     | The outside tool a measure reads, today [mock analytics](mocks/analytics/README.md). Selected per Product by its analytics project.                                              |
| Analytics project | The key of a Product's events in the metric source, for example `phc_flexibeck`. Set on the Product, never on a Goal.                                                            |
| Social channel    | The outside tool that holds public Comments about a Product, today [mock social](mocks/social/README.md).                                                                        |
| Social handle     | The name a Product's Comments go under in the social channel, for example `flexibeck`. Set on the Product.                                                                       |
| Comment           | A public post about a Product in the social channel. It stays there: Glue stores only the Insight about it.                                                                      |
| Sentiment         | The tone of a Comment: positive, neutral or negative. A free Hugging Face model labels it.                                                                                       |
| Draft             | An Insight that nobody has triaged yet. `measure` writes drafts.                                                                                                                 |
| Triage            | Deciding on a draft: keep it, discard it (only when no Decision cites it), or propose a Decision from it.                                                                        |
| Supersede         | Replace an accepted Decision with a new accepted one. The old one keeps its record id and points to its successor.                                                               |
| Downstream issue  | The GitHub issue Glue opens in a Product's repository when a Decision becomes accepted. A later write to the Decision opens none. Names the Decision id.                         |
| Question          | What a proposed Decision asks: its options, the pick of its author and the answer. The answer is one option or words, with the person and the time. It accepts the Decision.     |
| Option            | One possible answer to a question. Options keep their order and count from 1.                                                                                                    |
| Pick              | The option that the author of a question would take.                                                                                                                             |
| Not chosen        | A superseded Decision that was never accepted.                                                                                                                                   |

## User simulator

The Mock in [mocks/user-sim](mocks/user-sim/README.md). It makes the numbers a measure reads.

| Term      | Meaning                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| Bot       | A simulated user with seeded traits. Uses the deployed Product through its accessibility tree, like a person.         |
| Rule      | A behaviour model from UX research, for example choice overload. Changes what a Bot does, never tuned for a result.   |
| Journey   | The Steps a Bot tries in one Product, in order.                                                                       |
| Step      | One intent in a Journey, for example "accept a plan", with the accessible names to look for.                          |
| Struggle  | Per Rule, the chance to leave a Bot faced on one screen or on its whole walk. Sets its survey answer.                 |
| Technique | A baking task a novice cannot do from its name alone, for example stretch and fold. The worked example Rule reads it. |
| Demo      | A captioned image or video (an accessible `figure`) named for a Technique. Without one, novices struggle more.        |
| SEQ       | Single Ease Question: "How easy was it?", 1 very hard to 7 very easy. A Bot answers it from its Struggle.             |
| Remark    | The free text of a Bot's SEQ answer. Not a Comment: it goes to the Product, not to the social channel.                |

## Build run

| Term         | Meaning                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Owner        | The human who owns Goals and Guardrails and signs off Versions.                                |
| Orchestrator | The agent thread that plans a run, spawns Workers, reviews and merges. Writes no product code. |
| Worker       | An agent thread that builds one ticket in its own worktree and ends with a `RESULT:` line.     |
