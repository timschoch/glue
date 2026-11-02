#!/usr/bin/env node
// Moved to the Engine: naming/config.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from '../../verify/scripts/run-engine-script.mjs';

runEngineScript('naming/config.mjs', import.meta.url);
