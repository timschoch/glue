---
name: step-by-step
description: Walk the user through a manual procedure step by step, with every value spelled out and every link clickable.
disable-model-invocation: true
argument-hint: "What do you need walked through?"
---

# Step by step

The user is doing something for the first time that a regular would find obvious — creating a PAT, pointing a domain, wiring a CI secret. They don't want the theory. They want a numbered list they can run straight down, with every value filled in and every link clickable.

What you produce is a **block**: one handover message, sent whole, after which you stop and wait.

## The block

```
Now you: <what they are about to do>

<One line: what sits blocked until this is done.>

1. Open <full URL>
2. <Field>: <the exact value to type>
3. <Choice>: <the exact option to pick>. <The trap, if there is one.>
...
N. Test it: <full URL> → <what to click>

<What they see if it worked.> Tell me and I check it.
```

What makes it followable:

- **Every value is literal.** `Token name: habits-context-sync`, not "give it a name". You already know the repo, the owner, the secret name — dig them out of the environment and fill them in. A placeholder is a decision handed back to the person who asked for help.
- **Every link is a full URL, as deep as the site goes.** `https://github.com/settings/personal-access-tokens/new`, not "go to Settings → Developer settings". Where a page has no stable URL, give the click path from one that does.
- **Name the trap in the step it bites.** "Resource owner: pick `Habits-Family` in the dropdown. Not your personal account." A wrong pick here stays silent until much later.
- **Say what happens by itself**, so an unexpected field doesn't stall them: "(Metadata: Read-only gets added by itself.)"
- **Fold the fork into its step** rather than splitting the list: "If it says *pending approval*: approve it yourself at `<url>`."
- **The last step is a test**, with the result they should see.

Write screens, not systems: name the button they are looking at, in the words printed on it.

## Process

### 1. Do your half first

Everything reachable from the terminal, do it now — before writing a word of the block. What is left over is the part needing a browser, a dashboard, or a password. That leftover is also what gives you the opening line: what is now sitting inert until they act.

**Done when:** every remaining step genuinely needs a human.

### 2. Get the real procedure

Take the click path from a **primary source** — the vendor's current docs, or the page itself. Third-party UIs get renamed, and a remembered path sends the user hunting for a button that no longer exists. Take the values from the environment: git remotes, `.env`, `.env.example`, `.github/workflows/*` (every `secrets.*` reference names a value the block has to produce).

Where you cannot confirm the current UI, say so and ask them what they see. Every step traces to something you checked.

**Done when:** every step has its URL and its literal values, and you know what the final test proves.

### 3. Show the route, then hand over

| The procedure | What you send |
| --- | --- |
| Up to ~30 steps, one sitting | One block. Its numbered list is the route. |
| Over ~30 steps, or a wait in the middle, or more than one sitting | The route first — one line per part — then part 1 alone. |

Cut a long procedure on its **seams**, not on the step count: each part is one coherent job that ends on something they can check ("the token exists", "the secret is set", "the workflow ran green"). A part that ends mid-form is a bad cut even at exactly 30 steps. Head each one `Now you (2 of 4): wire the secret`, and number its steps from 1 again.

Then stop. One part per message, with the next one held back until this one lands.

### 4. Take the report

Whatever comes back — done, an error, a screen that doesn't match your description — settle it before the next part. A mismatched screen means your source went stale: go find the current path.

### 5. Prove it

Run the closing check yourself wherever you can reach it, so the goal ends up demonstrated rather than assumed.

## Secrets

A secret travels from the page that shows it straight to the field that consumes it. In the block:

- **Give it its own step**, naming the exact destination: the secret name and the settings URL, the `.env` line, the keychain entry.
- **Write "don't paste it into this chat"** into the step that creates it, in those words. This conversation becomes a transcript, and a transcript is not a secret store.
- **Flag one-shot values** where they are produced: "Copy it now, it is shown once."

To confirm they captured the right value, check a property — its prefix, its length, its last four characters — never the value itself. Where a value has to reach a tool you run, use a path that never prints it: `gh secret set NAME` prompting for it, or `read -s`.

If a secret lands in the chat anyway: say so plainly, have them revoke and reissue it, and carry on with the new one.
