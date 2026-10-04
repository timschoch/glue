# Sign-off on user-invoked tasks

1. On a user-invoked task, git state says who holds the work: 
- uncommitted = you're still working on it
- staged = you consider it done
- committed = the user signed it off

2. Finish in this order:
   1. Stage the work.
   2. Run the `verify` push stage: `node .agents/skills/verify/scripts/verify.mjs push`. Red: fix, stage, rerun.
   3. The staged diff holds a code file: run [code-review](.agents/skills/code-review/SKILL.md) against the base branch, with the user's request as the spec. Docs, rules or config only: skip the review.
   4. A blocking finding: a fresh subagent fixes it and stages. You do not fix it yourself. Rerun step 2. No second review.
   5. Show the work and the review findings, stop.

3. Commit, push, PR, and ticket resolution come only after the user's approval.
