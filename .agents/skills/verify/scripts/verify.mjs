#!/usr/bin/env node
// Moved to the Engine: verify/verify.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from './run-engine-script.mjs';

runEngineScript('verify/verify.mjs', import.meta.url);
