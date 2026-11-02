import { run } from './run.js';

// The repo settings module (ADR-0009 decision 8). Each GitHub repo setting
// skilly needs is read, compared with the wanted value, and set only when it
// differs. Setup applies; the Sync only checks and puts the drift in its
// report. Every GitHub call goes through `gh`.
export const RULESET_NAME = 'protect-trunk';
// ci.yml's job, and the commit status a workflow_dispatch run writes for the
// release PR (ADR-0009 decision 11). Required on every tier, sandbox included.
export const REQUIRED_CHECK = 'verify';

const RULESET = {
  name: RULESET_NAME,
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'required_status_checks',
      parameters: {
        do_not_enforce_on_create: false,
        required_status_checks: [{ context: REQUIRED_CHECK }],
        strict_required_status_checks_policy: false,
      },
    },
  ],
};
const RULE_TYPES = new Set(RULESET.rules.map(({ type }) => type));

// One `gh api` call. A body goes in on stdin; an empty answer (204) is null.
function callApi(path, { method = 'GET', body } = {}) {
  const args = ['api', path, '-X', method];
  if (body) args.push('--input', '-');
  const output = run('gh', args, { input: body && JSON.stringify(body) });
  return output ? JSON.parse(output) : null;
}

const isNotFound = (error) => /\(HTTP 404\)/.test(error.message);

// JSON with sorted object keys: GitHub does not keep the key order we send.
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item,
  );

// The part of a ruleset skilly owns. Rules of other types belong to the
// owner and stay.
function ownedPart(ruleset) {
  if (!ruleset) return null;
  const { target, enforcement, conditions, rules } = ruleset;
  const owned = rules.filter(({ type }) => RULE_TYPES.has(type)).sort((left, right) => left.type.localeCompare(right.type));
  return { target, enforcement, conditions, rules: owned };
}

function findRuleset(repo, get) {
  const summary = get(`repos/${repo}/rulesets?includes_parents=false`).find(
    ({ name, source_type }) => name === RULESET_NAME && source_type === 'Repository',
  );
  return summary ? get(`repos/${repo}/rulesets/${summary.id}`) : null;
}

const repoField = (name, want) => ({
  name,
  want,
  read(repo, get) {
    // GitHub leaves these fields out for a login without admin rights.
    const value = get(`repos/${repo}`)[name];
    if (value === undefined) throw new Error(`gh got no ${name} for ${repo}: the login needs admin rights`);
    return value;
  },
  write: (repo) => callApi(`repos/${repo}`, { method: 'PATCH', body: { [name]: want } }),
});

const SETTINGS = [
  repoField('allow_auto_merge', true),
  repoField('allow_squash_merge', true),
  // git-shortcuts merges epic branches with a merge commit.
  repoField('allow_merge_commit', true),
  repoField('delete_branch_on_merge', true),
  {
    // release-please opens the release PR with the default token.
    name: 'can_approve_pull_request_reviews',
    want: true,
    read: (repo, get) => get(`repos/${repo}/actions/permissions/workflow`).can_approve_pull_request_reviews,
    write: (repo) =>
      callApi(`repos/${repo}/actions/permissions/workflow`, {
        method: 'PUT',
        body: { can_approve_pull_request_reviews: true },
      }),
  },
  {
    name: 'vulnerability_alerts',
    want: true,
    read(repo, get) {
      try {
        get(`repos/${repo}/vulnerability-alerts`);
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    write: (repo) => callApi(`repos/${repo}/vulnerability-alerts`, { method: 'PUT' }),
  },
  {
    name: `ruleset ${RULESET_NAME}`,
    want: ownedPart(RULESET),
    read: (repo, get) => ownedPart(findRuleset(repo, get)),
    write(repo, get) {
      const current = findRuleset(repo, get);
      if (!current) return callApi(`repos/${repo}/rulesets`, { method: 'POST', body: RULESET });
      const ownerRules = current.rules.filter(({ type }) => !RULE_TYPES.has(type));
      return callApi(`repos/${repo}/rulesets/${current.id}`, {
        method: 'PUT',
        body: { ...RULESET, rules: [...RULESET.rules, ...ownerRules] },
      });
    },
  },
];

// Reads each setting once per pass. drift: the settings that differ, with
// the wanted and the actual value. unavailable: the settings gh could not
// read or set, such as a 403 for a login without admin rights or a plan
// without rulesets. One unavailable setting never stops the others.
function settle(repo, shouldWrite) {
  const answers = new Map();
  const get = (path) => {
    if (!answers.has(path)) {
      try {
        answers.set(path, { value: callApi(path) });
      } catch (error) {
        answers.set(path, { error });
      }
    }
    const { value, error } = answers.get(path);
    if (error) throw error;
    return value;
  };
  const drift = [];
  const unavailable = [];
  for (const setting of SETTINGS) {
    try {
      const have = setting.read(repo, get);
      if (canonical(have) === canonical(setting.want)) continue;
      if (shouldWrite) setting.write(repo, get);
      drift.push({ setting: setting.name, want: setting.want, have });
    } catch (error) {
      unavailable.push({ setting: setting.name, reason: error.message });
    }
  }
  return { drift, unavailable };
}

// Reads every setting of "owner/repo" and writes none.
export const validateSettings = (repo) => settle(repo, false);

// Sets each setting that drifts. drift lists what it set, so a second run
// returns an empty drift.
export const applySettings = (repo) => settle(repo, true);
