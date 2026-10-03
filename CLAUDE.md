# Glue

Concept hub: why a product is built the way it is. See [README.md](README.md).

## Commands

- `pnpm dev`: dev server, http://localhost:3000
- `pnpm typecheck`, `pnpm lint`, `pnpm check` (Prettier), `pnpm build`
- `node .agents/skills/verify/scripts/verify.mjs <commit|push|ci>`: the gate hooks and CI run. Add checks to [.skilly/verify.json](.skilly/verify.json), never to a hook.

## Rules

- UI: Carbon (`@carbon/react`) with its tokens, and CSS Modules. No Tailwind. A Mantine screen stays until its Carbon screen ships. No screen mixes both kits.
- Branches `<type>/<description>`, conventional commits. Never push to `main`; open a PR.
- Skills in [skills-lock.json](skills-lock.json) are synced by skilly: change them in the hub, https://github.com/timschoch/skilly. Repo-owned skills (not in the lock) live in `.agents/skills/` too, for example [t3-threads](.agents/skills/t3-threads/SKILL.md).
- A skill with `disable-model-invocation` refuses the Skill tool: read its `SKILL.md` in full and apply it. Examples: `ask-matt`, `interface-review`, `break`, `variant`.

## Which skill, in which order

- Feature: `grilling`, `to-spec`, `to-tickets`, `implement`, `verify`, `make-pr-easy-to-review`
- Bug: `diagnosing-bugs`, then `tdd`
- All code, feature or bug: `tdd`. The test comes first.
- Not sure which skill or flow fits: [ask-matt](.agents/skills/ask-matt/SKILL.md).
- Issues and labels: `triage`, `wayfinder`

## Build run

Agents build Glue in a run. The Orchestrator plans and merges, Workers build, the Owner decides. Terms: [CONTEXT.md](CONTEXT.md#build-run).

### Roles

| Role          | May                                                                                                                                                                                                                 | May not                                                                                                                                                            | Done when                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Owner (human) | Set Goals and Guardrails, sign off Versions, answer proposed Decisions in Glue                                                                                                                                      |                                                                                                                                                                    | Confirms or rolls back provisional Versions                                         |
| Orchestrator  | Plan circles, write tickets, spawn and steer Workers, pick research or build, pick free OSS, merge through the [merge gate](#merge-gate), merge the release PR at the end of a circle, sign Versions as provisional | Write product code, spend money, change Goals or Guardrails                                                                                                        | The run goal is reached, or it halts                                                |
| Worker        | Build one ticket in its own worktree and branch, commit, push, open a PR, add free OSS dependencies, ask the Orchestrator                                                                                           | Merge, touch another worktree, change workflow files (`CLAUDE.md`, `.claude/`, `.github/`, `.husky/`, `.skilly/`, `.agents/skills/`), use secrets it was not given | PR open, `verify ci` green, tests written first, final line `RESULT: done <PR URL>` |

- Spawn and watch Workers with [t3-threads](.agents/skills/t3-threads/SKILL.md). Per repo: 3 Workers + 1 Orchestrator at most.
- A Worker that cannot go on ends with `RESULT: blocked <why>` or `RESULT: question <question>`, never silence.
- Run goal: the open issue labelled `run-goal` on `timschoch/glue`. The Orchestrator records it as a Goal in Glue.

### Owner contact

- The Owner checks in every few hours. Work on what is not blocked.
- Ask the Owner in Glue: a `proposed` Decision with the options and your pick in its body. The Owner answers in the Glue app. The chat gets one short message per circle.
- A thing Glue cannot hold (credentials, sign-ups, trials): a GitHub issue labelled `ready-for-human`.
- Ask the Owner only what the Owner's role owns (see [Roles](#roles)). The Orchestrator accepts Decisions and plans circles itself.
  - Bad: "D1 to D4 are `proposed`. Do you accept them? Can I start circle 1?"
  - Good: "I accepted D1 to D4 and started circle 1."
- Ask early for anything that takes the Owner time: credentials, sign-ups (agents have no email account), trials.
- Halt the run only when all work is blocked or something broke badly. Halt: issue labelled `ready-for-human`, title starts with `HALT:`.

### Build concentric

Build the smallest Glue that runs the whole [loop](docs/concept.md#1-the-loop), then widen every part of it together:

`Understand → Decide → Design → Build → Use → Understand`

- Circles: listed in the run goal issue. Each circle ends with a release to the main deployment.
- Glue builds Glue. Use what the Glue app, its HTTP API and `pnpm concept` have. What is hard to use becomes an issue labelled `user-feedback`. Glue reads these issues as Signals.
- Dogfood:
  - No ticket without the Decision it implements.
  - No Decision without a Goal and evidence (Insight or Fact).
  - Findings go back as Insights: verify failures, review findings, research, analytics, Owner feedback.
- How Guardrails get enforced (CI, MCP, exports) is product work. Record it as Decisions in Glue.
- Circle report to the Owner at the end of each circle: shipped, Insights, Decisions proposed, overrides used, next circle.

### Scope

- Glue stays strategic: Goals, Decisions, evidence, Guardrails, Artifacts (entities, flows, architecture, API contracts as OpenAPI).
- Data that a specialist tool owns stays in that tool. Build a Mock for each tool the cycle needs (analytics like PostHog, CRM, design system with intent and pattern docs, as many as needed), outside Glue's app code.
- Glue may store data as an option for customers without the matching tool. The team decides how (cache or store, vector or relational).
- GitHub is a real Integration, not a Mock. Issues, feature requests and PRs are evidence Glue reads. What lives next to the code goes to GitHub.
- A message board for agents is optional. It grows with the agents that use it.

### Money

- Budget is 0. Free tiers and free OSS only.
- AI calls: Vercel AI Gateway, free models first. Team budget $5 per month. Never buy credits.
- Hugging Face models (for example Laya for classifying Insights) are free. Use them when they fit.
- A paid tool that Glue really needs: propose a trial to the Owner.

### Design

- The look and its rules live in Glue, in the Product `design-system`: `pnpm concept list --product design-system`. Read its Guardrails before a UI ticket.
- No text that describes the UI: no legends, hints or explaining sentences. One style, one meaning.
- Build UI with the `better-*` skills. Use `break` and `variant` for stress tests and options.

### Merge gate

The Orchestrator merges a PR only when all of these hold. [guard-workflow.mjs](.claude/hooks/guard-workflow.mjs) blocks `gh pr merge` otherwise.

1. Required checks green. The `pr workflow` step of `verify` wants an issue link, a `Decision:` line and a test change with source changes: [check-pr-workflow.mjs](scripts/check-pr-workflow.mjs).
2. UI change (`src/**/*.tsx`, `src/**/*.css`, not `*.test.tsx`): run [interface-review](.agents/skills/interface-review/SKILL.md) `pr <n>` with a rendered review, then comment `interface-review: Approve` or `interface-review: Block` on the PR.
3. After the merge: log review findings as Insights.

A deliberate skip of a blocked shell command: `GLUE_OVERRIDE="<reason>"` in the command. It is logged to `.temp/overrides.jsonl` and goes into the ring report.

### Second product

- Paused in the run of [issue 103](https://github.com/timschoch/glue/issues/103).
- At 30 to 40% of Glue's cycle, when Glue is usable, rebuild flexibeck from [its vision](https://github.com/timschoch/flexibeck/blob/main/docs/vision.html) in a new repo, with its own Vercel project and Neon database on free tiers.
- A second Orchestrator runs it with Glue as its concept hub. It talks to the Owner directly.
- It files what Glue lacks as issues on `timschoch/glue`. Those issues are Insights for Glue.

## Docs

- Domain language: [CONTEXT.md](CONTEXT.md)
- The target model: [docs/concept.md](docs/concept.md)
- Glue's own Concept: Goals, Decisions, Insights, Facts, Guardrails in the Neon database. Read it before a ticket: `pnpm concept list`, `pnpm concept show <id>` (needs `DATABASE_URL` from `.env.local`). Add records with `pnpm concept add`. Another Product: `--product <slug>`. Record types: [src/db/concept-fields.ts](src/db/concept-fields.ts). Every ticket and PR names its Decision id.
- Measure step: `pnpm collect-insights` turns failed checks, blocked reviews and overrides into draft Insights.
- Decisions about the repo's tooling that serve no Goal: [docs/adr/](docs/adr/)

## Agent skills

### Issue tracker

GitHub Issues on `timschoch/glue`, via `gh`. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Default five roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See [docs/agents/domain.md](docs/agents/domain.md).
