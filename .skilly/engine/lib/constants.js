// Pinned: `add` output is unparseable and exit codes lie — the lock file is the only truth.
export const SKILLS_CLI_VERSION = '1.5.23';
export const HUB_REPO = 'timschoch/skilly';
// The accounts whose skilly App installs the Hub nightly syncs. Any account can
// install the App; an install by anyone else is ignored.
export const HUB_OWNERS = ['timschoch', 'admin-laicadev', 'swissdesign-md', 'Habits-Family'];
// The lefthook a Consumer gets when it has none. Dependabot moves it from there. An exact version
// with publish proof: pnpm `trustPolicy: no-downgrade` refuses 2.2.2, and a range would resolve to it.
export const LEFTHOOK_VERSION = '2.2.1';
