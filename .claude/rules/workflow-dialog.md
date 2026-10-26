# Dialog

Good defaults, not law — the developer's word overrides anything here.

1. "Can we X?" means "can we, and should we?". Answer both: feasible or not, then your recommendation with the one reason that decides it. Never a bare "yes, possible". Keep it short, facts beat prose.
2. No time estimates. Never say how long a change takes to build. Say what it touches and the blast radius instead.
3. Questions are read only. A question about the code or the project gets an answer, never an edit. Edit only on an instruction.
4. Honour the stop point. When the user names one ("don't commit yet", "I'll tell you"), stop there and say you stopped there.
5. Number only what the user must react to: a question, a decision, an option to pick, a finding that needs a call. Status, done work and explanations stay plain text or bullets. One numbering runs for the whole conversation, so "3" means one thing. Never restart at 1, never a second list with A, B, C.
   - Bad: "1. I edited the rule. 2. Tests pass. 3. Which auth do you want?"
   - Good: "I edited the rule, tests pass." then "3. Which auth do you want?"
6. Any message about an existing item reuses its number, also when the agent asks it again later. Only a new item counts up.
   - Bad: agent "3. The server needs auth." User "3. Which auth?" Agent "4. OAuth."
   - Good: agent "3. The server needs auth." User "3. Which auth?" Agent "3. OAuth."
   - Bad: open item 9 comes back after 18 as `19. Where does the sync engine live?` with sub-items `9.1`, `9.2`.
   - Good: `9. Where does the sync engine live?` with `9.1`, `9.2`.
7. A sub-item always carries its parent's number: `12.1`, `12.2`. Write each one as its own nested `-` bullet. A bare `12.1` line is not a Markdown list item, so it renders on the parent's line.
   - Bad: "12. Three options: A foo, B bar, C baz."
   - Bad: `18.` with sub-items `21.1`, `21.2`.
   - Bad: `12.1 foo` and `12.2 bar` on their own lines without `-`. They render as one line.
   - Good:
     ```markdown
     12. Three options:
         - 12.1 foo
         - 12.2 bar
         - 12.3 baz
     ```
8. A question with two or more options gets one sub-item per option. Mark your pick with **recommended** at the start of its sub-item. No separate "I recommend" sentence.
   - Bad: "1. Fix it with the same dot rule for folders and files? Or the narrower fix from the issue? I recommend the same dot rule."
   - Good:
     ```markdown
     1. How do you want it fixed?
        - 1.1 **recommended** same dot rule for folders and files
        - 1.2 narrower fix from the issue, only for route folders
     ```
9. Show a flow of 3+ steps, or 3+ parts that talk to each other, as a mermaid diagram. Pick the kind by [writing-rules](.agents/skills/writing-rules/rules/all.md) rule 106. Explaining a prototype you built counts.
   - Bad: "The agent commits, then verify runs, then on green it pushes, then GitHub runs CI."
   - Good: a `sequenceDiagram` with Agent, Verify and GitHub.
