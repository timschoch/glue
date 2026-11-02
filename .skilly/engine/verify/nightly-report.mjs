#!/usr/bin/env node
// The nightly's issue step (ADR-0004 decisions 4 and 7). It reads the results that
// `verify.mjs <stage> --results <file>` wrote and keeps one open issue per check. A check is the
// first of a step's `issueLabels`; a step without them opens no issue. A new issue lists the red
// steps of its check. A later night with a different list adds a comment; the same list adds
// nothing.
//
// Usage: node .skilly/engine/verify/nightly-report.mjs <results.json>
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LIST_PREFIX = 'Red steps: ';
// Red: each label marks a broken check.
const LABEL_COLOR = 'B60205';

/** check label -> { labels, red }, red step names sorted, in the order the checks first appear. */
export function groupRedByCheck(results) {
  const checks = new Map();
  for (const { name, status, issueLabels = [] } of results) {
    if (status === 0 || !issueLabels.length) continue;
    const check = checks.get(issueLabels[0]) ?? { labels: issueLabels, red: [] };
    check.red.push(name);
    checks.set(issueLabels[0], check);
  }
  for (const check of checks.values()) check.red.sort();
  return checks;
}

/**
 * What one red check needs: a new issue, a comment on the open one, or null when the open one
 * already lists the same steps. `openIssue.text` is the newest of its body and comments.
 */
export function issueAction({ check, openIssue, runUrl }) {
  const list = `${LIST_PREFIX}${check.red.join(', ')}`;
  const body = `${list}\n\nRun: ${runUrl}\n`;
  if (!openIssue) {
    return { kind: 'create', labels: check.labels, title: `Nightly red: ${check.red.join(', ')}`, body };
  }
  const known = openIssue.text.split('\n').find((line) => line.startsWith(LIST_PREFIX));
  return known === list ? null : { kind: 'comment', number: openIssue.number, body };
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

const findOpenIssue = (label) => {
  const [issue] = JSON.parse(gh('issue', 'list', '--label', label, '--state', 'open', '--json', 'number,body,comments'));
  if (!issue) return undefined;
  return { number: issue.number, text: issue.comments.at(-1)?.body ?? issue.body };
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runUrl = process.env.RUN_URL ?? 'unknown';
  const results = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  for (const [label, check] of groupRedByCheck(results)) {
    const action = issueAction({ check, openIssue: findOpenIssue(label), runUrl });
    if (action?.kind === 'create') {
      for (const name of action.labels) gh('label', 'create', name, '--color', LABEL_COLOR, '--force');
      gh('issue', 'create', ...action.labels.flatMap((name) => ['--label', name]), '--title', action.title, '--body', action.body);
    } else if (action?.kind === 'comment') {
      gh('issue', 'comment', String(action.number), '--body', action.body);
    }
  }
}
