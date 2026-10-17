#!/usr/bin/env node
// The `audit` step of verify, with an accept list (rules: the verify skill's Audit section).
// npm's own `fixAvailable` is no use for the stale check: it proposes any version outside the
// vulnerable range, even a downgrade. So the fix check asks the GitHub advisory API.
// verify.mjs passes the step as JSON in VERIFY_STEP. GITHUB_TOKEN or GH_TOKEN, when set, lifts
// the API's anonymous rate limit.

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const AUDIT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;
const RATE_LIMIT_STATUSES = new Set([403, 429]);

// npm writes "<=3.0.3", GitHub "<= 3.0.3".
const toRangeKey = (range) => range.replace(/\s/g, '');

const addFinding = (found, id, name, range) => {
  const finding = found.get(id) ?? { name, ranges: new Set() };
  finding.ranges.add(toRangeKey(range));
  found.set(id, finding);
};

/** High and critical advisories in `npm audit --json` output, as GHSA id → { name, ranges }. */
export const parseNpm = (output) => {
  const report = JSON.parse(output);
  if (report.error) throw new Error(report.error.summary ?? JSON.stringify(report.error));
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via) {
      // A string `via` points at another entry, which lists the advisory itself.
      if (typeof via === 'object' && BLOCKING_SEVERITIES.has(via.severity)) {
        addFinding(found, via.url.split('/').at(-1), via.name, via.range);
      }
    }
  }
  return found;
};

/** High and critical advisories in `yarn audit --json` output (yarn 1, one JSON object per line). */
export const parseYarn = (output) => {
  const found = new Map();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.data);
    const advisory = event.type === 'auditAdvisory' ? event.data.advisory : null;
    if (advisory && BLOCKING_SEVERITIES.has(advisory.severity)) {
      addFinding(found, advisory.github_advisory_id, advisory.module_name, advisory.vulnerable_versions);
    }
  }
  return found;
};

/**
 * Checks the accept list against the audit. `found` maps GHSA id → { name, ranges }, `fixed`
 * holds the accepted ids that GitHub now lists a patched version for.
 */
export const validateAccept = (found, accept, fixed) => {
  const isComplete = (entry) => typeof entry.id === 'string' && Boolean(entry.why);
  const acceptedIds = new Set(accept.filter(isComplete).map((entry) => entry.id));
  const accepted = [];
  const problems = [];
  for (const [id, { name }] of found) {
    if (!acceptedIds.has(id)) problems.push(`${id} (${name}): upgrade the dependency. No fix exists: accept it in .skilly/verify.json, with a why.`);
  }
  for (const entry of accept) {
    if (!isComplete(entry)) problems.push(`${JSON.stringify(entry)}: an accept entry needs an id and a why.`);
    else if (!found.has(entry.id)) problems.push(`${entry.id}: the audit no longer finds it. Remove the accept entry.`);
    else if (fixed.has(entry.id)) problems.push(`${entry.id} (${found.get(entry.id).name}): a fix exists now. Upgrade, then remove the accept entry.`);
    else accepted.push({ ...entry, name: found.get(entry.id).name });
  }
  return { accepted, problems };
};

/** True when GitHub lists a patched version of `name` for a range the audit matched. */
export const fetchHasFix = async (id, { name, ranges }) => {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const response = await fetch(`https://api.github.com/advisories/${id}`, {
    headers: { accept: 'application/vnd.github+json', ...(token && { authorization: `Bearer ${token}` }) },
  });
  if (RATE_LIMIT_STATUSES.has(response.status)) {
    throw new Error(`GitHub answered ${response.status} for advisory ${id}, likely the anonymous rate limit. Set GITHUB_TOKEN or GH_TOKEN.`);
  }
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for advisory ${id}`);
  const advisory = await response.json();
  return advisory.vulnerabilities.some(
    (vulnerability) =>
      vulnerability.package.name === name &&
      ranges.has(toRangeKey(vulnerability.vulnerable_version_range)) &&
      Boolean(vulnerability.first_patched_version),
  );
};

const main = async () => {
  const accept = JSON.parse(process.env.VERIFY_STEP ?? '{}').accept ?? [];
  if (!Array.isArray(accept)) throw new Error('accept on the audit step must be an array.');

  const yarn = existsSync('yarn.lock');
  const result = spawnSync(yarn ? 'yarn' : 'npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: AUDIT_MAX_BUFFER_BYTES });
  if (result.error) throw result.error;
  let found;
  try {
    found = yarn ? parseYarn(result.stdout) : parseNpm(result.stdout);
  } catch (error) {
    // yarn 2+ has no `yarn audit`; its usage error lands here.
    throw new Error(`cannot read the ${yarn ? 'yarn' : 'npm'} audit output: ${error.message}\n${result.stderr}`);
  }

  const fixed = new Set();
  for (const entry of accept) {
    if (found.has(entry.id) && (await fetchHasFix(entry.id, found.get(entry.id)))) fixed.add(entry.id);
  }

  const { accepted, problems } = validateAccept(found, accept, fixed);
  for (const entry of accepted) console.log(`accepted ${entry.id} (${entry.name}): ${entry.why}`);
  if (problems.length === 0) {
    console.log(`no high or critical advisory blocks (${found.size} found, ${accepted.length} accepted)`);
    return;
  }
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`audit: ${error.message}`);
    process.exitCode = 2;
  });
}
