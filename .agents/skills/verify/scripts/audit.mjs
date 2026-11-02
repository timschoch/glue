#!/usr/bin/env node
// Moved to the Engine: verify/audit.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from './run-engine-script.mjs';

runEngineScript('verify/audit.mjs', import.meta.url);
