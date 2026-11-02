#!/usr/bin/env node
// Moved to the Engine: verify/run-changed-tests.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from './run-engine-script.mjs';

runEngineScript('verify/run-changed-tests.mjs', import.meta.url);
