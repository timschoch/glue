# Model selection

Use this rule each time you start a subagent or a teammate. These are defaults. The developer's instructions override them.

## Pick a model and an effort

Set `model` and `effort` in every agent definition. If you leave them out, the agent copies the parent's settings, and those are often wrong for the task.

| Task | `model` | `effort` |
|---|---|---|
| Normal coding, refactoring, edits across many files, code review | `opus` | `medium` |
| Hard coding, architecture, deep reasoning, writing | `opus` | `high` |
| Orchestration: splitting work that does not fit in one context window across other agents | `opus` | `medium` |
| Visual work: UI, design system components, frontend polish, visual prototypes | `opus` | `high` |
| Small coding tasks, research, writing tests | `sonnet` | `medium` |
| Workers under an orchestrator that edit files | `sonnet` | `low` |
| Read-only work: lookups, codebase search, classification, summaries | `haiku` | `medium` |

If no row fits, use `opus` with `medium`.

## Rules

1. **Change the effort before you change the model.** Try a higher effort on the same model first. Use `max` only by hand, after `high` failed.
2. **Keep the effort the same during one agent's run.** A change in effort clears the prompt cache. Give different agents different efforts instead.
3. **Do not orchestrate serial work.** When each step needs the result of the step before, use one agent. Orchestrate only parts that can run at the same time.
4. **Delegate only when it helps.** If one agent can finish the work in one pass, do it yourself. Start a subagent only for:
   - heavy reading: research, a broad search, many files
   - independent parts that can run at the same time
   - a second review, free from your own bias

   The subagent returns its conclusion, not its raw output.
5. **Haiku and Sonnet stop at `high`.** When `high` is not enough, go one model up at `medium`: `haiku` → `sonnet`, `sonnet` → `opus`.
6. **Use Haiku only at `medium` or `high`.** At `low` it skips searches and stops early. Above `high` it can spend all its tokens on thinking and return no answer.

## Example

```yaml
---
name: bulk-worker
description: Does one small task that an orchestrator hands to it.
model: sonnet     # haiku | sonnet | opus | full model ID | inherit
effort: low       # low | medium | high | xhigh | max
---
```
