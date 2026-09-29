---
id: I3
title: PR #16 skilly / gate check failed
date: 2026-09-29
source: https://github.com/timschoch/glue/actions/runs/36597934665/job/109507564146
---

skilly / gate failed on https://github.com/timschoch/glue/pull/16. Second naming failure after I2, although the Worker prompt said to read the naming skill first. Filed upstream: https://github.com/timschoch/skilly/issues/117.

FAIL scripts/collect-insights.mjs:89 verb-synonym: "checkFindings" says check, the repo says validate — use validateFindings
