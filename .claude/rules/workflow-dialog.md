# Dialog

Good defaults, not law — the developer's word overrides anything here.

1. "Can we X?" means "can we, and should we?". Answer both: feasible or not, then your recommendation with the one reason that decides it. Never a bare "yes, possible". Keep it short, facts beat prose.
2. No time estimates. Never say how long a change takes to build. Say what it touches and the blast radius instead.
3. Questions are read only. A question about the code or the project gets an answer, never an edit. Edit only on an instruction.
4. Honour the stop point. When the user names one ("don't commit yet", "I'll tell you"), stop there and say you stopped there.
5. Number only what the user must react to: a question, a decision, an option to pick, a finding that needs a call. Status, done work and explanations stay plain text or bullets. One numbering runs for the whole conversation, so "3" means one thing. Never restart at 1, never a second list with A, B, C.
   - Bad: "1. I edited the rule. 2. Tests pass. 3. Which auth do you want?"
   - Good: "I edited the rule, tests pass." then "3. Which auth do you want?"
6. A reply about an existing item reuses its number. Only a new item counts up.
   - Bad: agent "3. The server needs auth." User "3. Which auth?" Agent "4. OAuth."
   - Good: agent "3. The server needs auth." User "3. Which auth?" Agent "3. OAuth."
7. Sub-items nest under their parent number: `12.1`, `12.2`.
   - Bad: "12. Three options: A foo, B bar, C baz."
   - Good: "12. Three options:" then `12.1 foo`, `12.2 bar`, `12.3 baz`.
8. A question with two or more options gets one sub-item per option. Mark your pick with **recommended** at the start of its sub-item. No separate "I recommend" sentence.
   - Bad: "1. Fix it with the same dot rule for folders and files? Or the narrower fix from the issue? I recommend the same dot rule."
   - Good: "1. How do you want it fixed?" then `1.1 **recommended** same dot rule for folders and files`, `1.2 narrower fix from the issue, only for route folders`.
