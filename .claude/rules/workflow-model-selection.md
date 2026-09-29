# Model selection

Use this rule each time you start a subagent or a teammate. These are defaults. The developer's instructions override them.

## Pick a model and an effort

Set `model` and `effort` in every agent definition. If you leave them out, the agent copies the parent's settings, and those are often wrong for the task.

| Task | `model` | `effort` |
|---|---|---|
| Normal coding, refactoring, edits across many files, code review | `opus` | `medium` |
| Hard coding, architecture, deep reasoning, writing | `opus` | `high` |
| Orchestration: splitting work that does not fit in one context window across other agents | `opus` | `low` |
| Visual work: UI, design system components, frontend polish, visual prototypes | `fable` | `high` |
| Small coding tasks, research, writing tests | `sonnet` | `medium` |
| Workers under an orchestrator, simple lookups, classification | `sonnet` | `low` |

If no row fits, use `opus` with `medium`.

## Rules

1. **Change the effort before you change the model.** Try a higher effort on the same model first. Use `max` only by hand, after `high` failed.
2. **Use Fable only for visual work.** Opus scores higher on benchmarks. Fable makes better-looking UI and designs.
3. **Keep the effort the same during one agent's run.** A change in effort clears the prompt cache. Give different agents different efforts instead.
4. **Do not orchestrate serial work.** When each step needs the result of the step before, use one agent. Orchestrate only parts that can run at the same time.
5. **Delegate only when it helps.** If one agent can finish the work in one pass, do it yourself. Start a subagent only for:
   - heavy reading: research, a broad search, many files
   - independent parts that can run at the same time
   - a second review, free from your own bias

   The subagent returns its conclusion, not its raw output.
6. **Fable can refuse a task.** It returns `stop_reason: "refusal"` with HTTP 200, so the call looks like a success. Name a fallback model for each Fable job that runs without a person watching.

## Example

```yaml
---
name: bulk-worker
description: Does one small task that an orchestrator hands to it.
model: sonnet     # sonnet | opus | fable | full model ID | inherit
effort: low       # low | medium | high | xhigh | max
---
```
