---
id: I5
title: PR #7 verify check failed
date: 2026-09-29
source: https://github.com/timschoch/glue/actions/runs/36590662219/job/109482588125
---

verify failed on https://github.com/timschoch/glue/pull/7: the `workflow guards` step passed its test globs unexpanded (`Cannot find module .../scripts`). `scripts/collect-insights.mjs` keeps only `FAIL ` lines, so this body was written by hand.
