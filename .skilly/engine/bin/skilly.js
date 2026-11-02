#!/usr/bin/env node
// The Engine CLI: node .skilly/engine/bin/skilly.js add|remove <bundle-or-skill...> | sync | settings
// add and remove write files and print the Sync report. You review and commit them.
// sync opens or updates the Sync PR at the newest Release. It runs that
// Release's Engine with `deliver <snapshot-dir> <release>`.
// settings [--apply] [owner/repo] checks the repo settings, or sets the ones
// that drift. The repo defaults to the origin.
import { runVerb } from '../lib/add-remove.js';
import { deliver, startSync } from '../lib/delivery.js';
import { applySettings, validateSettings } from '../lib/repo-settings.js';
import { selfSource } from '../lib/self-source.js';

const USAGE =
  'usage: node .skilly/engine/bin/skilly.js add|remove <bundle-or-skill...> | sync | settings [--apply] [owner/repo]';
const cwd = process.cwd();
const [verb, ...names] = process.argv.slice(2);

function printEdit(report) {
  const list = (items) => (items.length ? items.join(', ') : 'none');
  console.log(`Release: ${report.release.before ?? 'none'} -> ${report.release.after}`);
  console.log(`skills added: ${list(report.skills.added)}`);
  console.log(`skills removed: ${list(report.skills.removed)}`);
  if (report.bundles.removed.length) console.log(`Bundles the Release dropped: ${list(report.bundles.removed)}`);
  console.log(`files written (${report.files.length}):`);
  for (const file of report.files) console.log(`  ${file}`);
  if (report.files.length) console.log('Review the files, then commit them.');
}

function printDelivery({ report, pr, autoMerge }) {
  console.log(`Release: ${report.release.before ?? 'none'} -> ${report.release.after}`);
  if (!pr) return console.log('Nothing to sync: the default branch already matches this Release.');
  if (!pr.pushed) return console.log(`Sync PR unchanged: ${pr.url}`);
  console.log(`Sync PR ${pr.created ? 'opened' : 'updated'}: ${pr.url}`);
  const wanted = autoMerge.on ? 'on' : 'off';
  console.log(`Auto-merge ${autoMerge.applied ? wanted : `could not be turned ${wanted}`}: ${autoMerge.reason}.`);
}

// Exit code 1 when a setting is unavailable to this gh login.
function runSettings(options) {
  const shouldApply = options.includes('--apply');
  const repo = options.find((option) => option !== '--apply') ?? selfSource(cwd);
  if (!repo) throw new Error('no GitHub origin here — name the repo: settings [--apply] owner/repo');
  const { drift, unavailable } = shouldApply ? applySettings(repo) : validateSettings(repo);
  const label = shouldApply ? 'set' : 'drift';
  for (const { setting, want, have } of drift) {
    console.log(`${label}: ${setting}: ${JSON.stringify(have)} -> ${JSON.stringify(want)}`);
  }
  for (const { setting, reason } of unavailable) console.log(`unavailable: ${setting}: ${reason}`);
  if (!drift.length && !unavailable.length) console.log(`${repo}: every repo setting matches`);
  return unavailable.length ? 1 : 0;
}

try {
  if (verb === 'add' || verb === 'remove') printEdit(runVerb(verb, names, { cwd }));
  else if (verb === 'sync') process.exitCode = startSync({ cwd });
  else if (verb === 'deliver' && names.length === 2) printDelivery(deliver({ cwd, snapshot: { dir: names[0], release: names[1] } }));
  else if (verb === 'settings') process.exitCode = runSettings(names);
  else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`skilly: ${error.message}`);
  process.exitCode = 1;
}
