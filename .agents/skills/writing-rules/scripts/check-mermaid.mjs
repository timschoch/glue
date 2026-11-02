#!/usr/bin/env node
// Moved to the Engine: writing-rules/check-mermaid.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from '../../verify/scripts/run-engine-script.mjs';

runEngineScript('writing-rules/check-mermaid.mjs', import.meta.url);
