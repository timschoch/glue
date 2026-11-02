#!/usr/bin/env node
// Moved to the Engine: verify/check-branch-name.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from './run-engine-script.mjs';

runEngineScript('verify/check-branch-name.mjs', import.meta.url);
