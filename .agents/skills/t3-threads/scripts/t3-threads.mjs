#!/usr/bin/env node
// Spawns and watches T3 Code threads through the local T3 server API.
// Usage: see ../SKILL.md, or run with no arguments.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const T3_HOME = process.env.T3CODE_HOME ?? join(homedir(), ".t3");
const APP = process.env.T3_APP ?? "/Applications/T3 Code (Alpha).app";
const CACHE = join(homedir(), ".cache", "t3-threads");
const STATE_FILE = join(CACHE, "threads.json");
const TOKEN_FILE = join(CACHE, "token.json");
const MAX_WORKERS = Number(process.env.T3_MAX_WORKERS ?? 3);
const TOKEN_TTL_MINUTES = 60;

mkdirSync(CACHE, { recursive: true, mode: 0o700 });

// --- T3 server CLI and HTTP API ---------------------------------------------

function appVersion() {
  return execFileSync("defaults", ["read", join(APP, "Contents", "Info"), "CFBundleShortVersionString"], {
    encoding: "utf8",
  }).trim();
}

function serverBin() {
  const dir = join(CACHE, `asar-${appVersion()}`);
  const bin = join(dir, "apps", "server", "dist", "bin.mjs");
  if (!existsSync(bin)) {
    execFileSync("npx", ["-y", "@electron/asar", "extract", join(APP, "Contents", "Resources", "app.asar"), dir], {
      stdio: "ignore",
    });
  }
  return bin;
}

function t3Cli(args) {
  const electron = join(APP, "Contents", "MacOS", basename(APP, ".app"));
  return execFileSync(electron, [serverBin(), ...args, "--base-dir", T3_HOME], {
    encoding: "utf8",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  }).trim();
}

function serverUrl() {
  const runtime = JSON.parse(readFileSync(join(T3_HOME, "userdata", "server-runtime.json"), "utf8"));
  return runtime.origin ?? `http://127.0.0.1:${runtime.port}`;
}

// Tokens live 1 hour and never reach stdout. A new one is issued 5 minutes before expiry.
function token() {
  if (existsSync(TOKEN_FILE)) {
    const cached = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    if (cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  }
  const issued = t3Cli(["auth", "session", "issue", "--ttl", `${TOKEN_TTL_MINUTES}m`, "--label", "t3-threads", "--token-only"]);
  const expiresAt = Date.now() + TOKEN_TTL_MINUTES * 60_000;
  writeFileSync(TOKEN_FILE, JSON.stringify({ token: issued, expiresAt }), { mode: 0o600 });
  return issued;
}

async function api(path, body) {
  const response = await fetch(`${serverUrl()}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const dispatch = (command) =>
  api("/api/orchestration/dispatch", { commandId: randomUUID(), ...command });
const now = () => new Date().toISOString();

// --- Local state ------------------------------------------------------------

const readState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {});
const writeState = (state) => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

async function fetchThread(threadId) {
  const result = await api(`/api/orchestration/threads/${threadId}`);
  return result.thread ?? result;
}

function lastReply(thread) {
  const replies = (thread.messages ?? []).filter((message) => message.role === "assistant" && !message.streaming);
  return replies.at(-1)?.text ?? "";
}

// A finished turn is not finished work. Workers end with "RESULT: done|blocked|question <detail>".
function report(threadId, thread) {
  const reply = lastReply(thread);
  const match = reply.match(/^RESULT: (done|blocked|question)\b[ :]*(.*)$/m);
  return { threadId, state: turnState(thread), result: match?.[1] ?? "none", detail: match?.[2] ?? "", reply };
}

// A thread without a turn yet is starting: it counts toward the limit.
const turnState = (thread) => (thread ? (thread.latestTurn?.state ?? "starting") : "gone");

// Running threads of one repo and role. Limits are per repo: 3 workers + 1 orchestrator.
async function runningThreads(repo, role) {
  const state = readState();
  const running = [];
  for (const [threadId, meta] of Object.entries(state)) {
    if (meta.repo !== repo || meta.role !== role) continue;
    const thread = await fetchThread(threadId).catch((error) => {
      if (error.message.includes("→ 404")) return null;
      throw error;
    });
    if (!thread) delete state[threadId]; // deleted in the T3 app
    else if (["running", "starting"].includes(turnState(thread))) running.push(threadId);
  }
  writeState(state);
  return running;
}

// --- Git and projects -------------------------------------------------------

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function mainRepoRoot(path) {
  const commonDir = git(path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return resolve(commonDir, "..");
}

async function ensureProject(repoPath) {
  const root = mainRepoRoot(repoPath);
  const findProject = async () => {
    const snapshot = await api("/api/orchestration/snapshot");
    const projects = snapshot.projects ?? snapshot.readModel?.projects ?? [];
    return projects.find((project) => project.workspaceRoot === root && !project.deletedAt);
  };
  const existing = await findProject();
  if (existing) return existing.id;
  t3Cli(["project", "add", root]);
  const created = await findProject();
  if (!created) throw new Error(`T3 project for ${root} not found after "project add"`);
  return created.id;
}

function writeRole(worktree, role) {
  if (!["orchestrator", "worker"].includes(role)) throw new Error(`unknown role: ${role}`);
  mkdirSync(join(worktree, ".temp"), { recursive: true });
  writeFileSync(join(worktree, ".temp", "role"), `${role}\n`);
}

// --- Commands ---------------------------------------------------------------

function parseFlags(args) {
  const flags = { _: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg.startsWith("--")) flags[arg.slice(2)] = args[++index];
    else flags._.push(arg);
  }
  return flags;
}

function readPrompt(flags) {
  if (flags["prompt-file"]) return readFileSync(flags["prompt-file"], "utf8");
  if (flags.prompt) return flags.prompt;
  throw new Error("--prompt-file or --prompt is required");
}

function modelSelection(flags) {
  const options = flags.effort ? [{ id: "effort", value: flags.effort }] : undefined;
  return { instanceId: "claudeAgent", model: flags.model ?? "claude-sonnet-5", ...(options && { options }) };
}

async function spawn(flags) {
  for (const required of ["repo", "branch", "title"]) {
    if (!flags[required]) throw new Error(`--${required} is required`);
  }
  const prompt = readPrompt(flags);
  const root = mainRepoRoot(flags.repo);
  const role = flags.role ?? "worker";
  const limit = role === "orchestrator" ? 1 : MAX_WORKERS;
  const running = await runningThreads(root, role);
  if (running.length >= limit) {
    throw new Error(`${running.length} ${role} threads running in ${basename(root)}, limit is ${limit}. Wait for one: ${running.join(", ")}`);
  }

  const worktree = join(T3_HOME, "worktrees", basename(root), flags.branch.replaceAll("/", "-"));
  git(root, ["fetch", "--quiet", "origin"]);
  git(root, ["worktree", "add", "-b", flags.branch, worktree, flags.base ?? "origin/main"]);
  writeRole(worktree, role);
  if (existsSync(join(root, ".env.local"))) copyFileSync(join(root, ".env.local"), join(worktree, ".env.local"));

  const projectId = await ensureProject(root);
  const threadId = randomUUID();
  const mode = { runtimeMode: "full-access", interactionMode: "default" };
  await dispatch({
    type: "thread.create",
    threadId,
    projectId,
    title: flags.title,
    modelSelection: modelSelection(flags),
    ...mode,
    branch: flags.branch,
    worktreePath: worktree,
    createdAt: now(),
  });
  await send(threadId, prompt);

  const state = readState();
  state[threadId] = { title: flags.title, repo: root, branch: flags.branch, worktree, role };
  writeState(state);
  console.log(JSON.stringify({ threadId, worktree, branch: flags.branch }));
}

async function send(threadId, text) {
  await dispatch({
    type: "thread.turn.start",
    threadId,
    message: { messageId: randomUUID(), role: "user", text, attachments: [] },
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt: now(),
  });
}

async function status(threadId) {
  if (threadId) {
    const thread = await fetchThread(threadId);
    console.log(JSON.stringify(report(threadId, thread), null, 2));
    return;
  }
  const state = readState();
  const rows = [];
  for (const [id, meta] of Object.entries(state)) {
    const thread = await fetchThread(id).catch(() => null);
    rows.push({ threadId: id, repo: basename(meta.repo), role: meta.role, title: meta.title, branch: meta.branch, state: turnState(thread) });
  }
  console.log(JSON.stringify({ limits: { worker: MAX_WORKERS, orchestrator: 1, per: "repo" }, threads: rows }, null, 2));
}

async function wait(threadId, flags) {
  const deadline = Date.now() + Number(flags.timeout ?? 120) * 60_000;
  while (Date.now() < deadline) {
    const thread = await fetchThread(threadId);
    if (!["running", "starting"].includes(turnState(thread))) {
      console.log(JSON.stringify(report(threadId, thread), null, 2));
      return;
    }
    await new Promise((done) => setTimeout(done, 15_000));
  }
  throw new Error(`timeout: ${threadId} still running`);
}

async function remove(threadId, flags) {
  const meta = readState()[threadId];
  await dispatch({ type: "thread.delete", threadId });
  if (flags.worktree === "yes" && meta) git(meta.repo, ["worktree", "remove", meta.worktree]);
  const state = readState();
  delete state[threadId];
  writeState(state);
  console.log(JSON.stringify({ removed: threadId, worktreeRemoved: flags.worktree === "yes" }));
}

const USAGE = `t3-threads <command>
  spawn  --repo <path> --branch <type/desc> --title <t> (--prompt-file <f> | --prompt <text>)
         [--model claude-sonnet-5] [--effort low|medium|high] [--role worker|orchestrator] [--base origin/main]
  send   <threadId> (--prompt-file <f> | --prompt <text>)
  status [threadId]
  wait   <threadId> [--timeout <minutes, default 120>]
  remove <threadId> [--worktree yes]
  role   <orchestrator|worker> [--repo <path>]
  project <repo path>
Limits per repo: ${MAX_WORKERS} running workers (T3_MAX_WORKERS) + 1 orchestrator.`;

const [command, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);
const commands = {
  spawn: () => spawn(flags),
  send: () => send(flags._[0], readPrompt(flags)).then(() => console.log(JSON.stringify({ sent: flags._[0] }))),
  status: () => status(flags._[0]),
  wait: () => wait(flags._[0], flags),
  remove: () => remove(flags._[0], flags),
  role: () => writeRole(git(flags.repo ?? process.cwd(), ["rev-parse", "--show-toplevel"]), flags._[0]),
  project: async () => console.log(await ensureProject(flags._[0] ?? process.cwd())),
};

if (!commands[command]) {
  console.log(USAGE);
  process.exit(command ? 1 : 0);
}
try {
  await commands[command]();
} catch (error) {
  console.error(`t3-threads: ${error.message}`);
  process.exit(1);
}
