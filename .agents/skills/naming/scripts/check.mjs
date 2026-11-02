#!/usr/bin/env node
// Moved to the Engine: naming/check.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from '../../verify/scripts/run-engine-script.mjs';

runEngineScript('naming/check.mjs', import.meta.url);
