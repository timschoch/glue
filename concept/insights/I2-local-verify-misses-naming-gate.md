---
id: I2
title: Local verify ci passes while the required skilly gate fails on naming
date: 2026-09-29
source: https://github.com/timschoch/glue/actions/runs/36594001270/job/109494089252
---

PR #13 was green on `node .agents/skills/verify/scripts/verify.mjs ci` and red on the required `skilly / gate` check: `needsQuoting` broke the naming rule. Workers learn about naming only after the push.
