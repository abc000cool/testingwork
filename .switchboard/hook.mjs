#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// src/hookmain.ts
import { spawn, spawnSync as spawnSync2 } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync as readFileSync2, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import os from "node:os";
import path3 from "node:path";

// src/files.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
function switchboardDir(root) {
  return path.join(root, ".switchboard");
}
var PRE_COMMIT_MARKER = "# installed by switchboard (L2 lease guard)";
function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function writeJsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
function configPath(root) {
  return path.join(switchboardDir(root), "config.json");
}
function localPath(root) {
  return path.join(switchboardDir(root), "local.json");
}
function cachePath(root) {
  return path.join(switchboardDir(root), "cache.json");
}
function heartbeatPidPath(root) {
  return path.join(switchboardDir(root), "heartbeat.pid");
}
function bgSyncPidPath(root) {
  return path.join(switchboardDir(root), "bgsync.pid");
}
function readConfig(root) {
  return readJsonFile(configPath(root));
}
function readLocal(root) {
  return readJsonFile(localPath(root));
}
function writeLocal(root, state) {
  writeJsonFile(localPath(root), state);
}
function readCache(root) {
  return readJsonFile(cachePath(root));
}
function writeCache(root, cache) {
  writeJsonFile(cachePath(root), cache);
}

// src/git.ts
import { spawnSync } from "node:child_process";
import path2 from "node:path";
function gitTimed(root, timeoutMs, ...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: timeoutMs });
  if (r.error || r.status !== 0) return { ok: false, out: ((r.stderr ?? "") + (r.stdout ?? "")).trim() };
  return { ok: true, out: (r.stdout ?? "").trim() };
}
function git(root, ...args) {
  return gitTimed(root, 15e3, ...args);
}
function currentBranch(root) {
  const r = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  return r.ok ? r.out : null;
}
function headSha(root) {
  const r = git(root, "rev-parse", "HEAD");
  return r.ok ? r.out : null;
}
function remoteLiveExists(root, liveBranch) {
  return git(root, "rev-parse", "--verify", "--quiet", `origin/${liveBranch}`).ok;
}
function mergeBaseWithLive(root, liveBranch) {
  if (!remoteLiveExists(root, liveBranch)) return null;
  const r = git(root, "merge-base", "HEAD", `origin/${liveBranch}`);
  return r.ok ? r.out : null;
}
function headContainedIn(root, sha) {
  if (!git(root, "cat-file", "-e", `${sha}^{commit}`).ok) return false;
  const head = headSha(root);
  if (head === null) return false;
  if (head === sha) return true;
  return git(root, "merge-base", "--is-ancestor", head, sha).ok;
}
function gitUserName(root) {
  const r = git(root, "config", "user.name");
  return r.ok && r.out.length > 0 ? r.out : null;
}
function repoRelative(root, filePath) {
  const abs = path2.isAbsolute(filePath) ? filePath : path2.resolve(root, filePath);
  const rel = path2.relative(path2.resolve(root), abs);
  if (rel === "" || rel.startsWith("..") || path2.isAbsolute(rel)) return null;
  return rel.split(path2.sep).join("/");
}
function stagedFiles(root) {
  const r = git(root, "diff", "--cached", "--name-only", "-z");
  if (!r.ok || r.out === "") return [];
  return r.out.split("\0").filter((s) => s.length > 0);
}
function hasStagedChanges(root) {
  const r = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root, timeout: 15e3 });
  return r.status === 1;
}
function stagedRenames(root) {
  const r = spawnSync("git", ["status", "--porcelain", "-z"], { cwd: root, encoding: "utf8", timeout: 15e3 });
  if (r.error || r.status !== 0 || !r.stdout) return [];
  const tokens = r.stdout.split("\0");
  const renames = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry || entry.length < 4) continue;
    const x = entry[0];
    const to = entry.slice(3);
    if (x === "R" || x === "C") {
      const from = tokens[i + 1];
      i++;
      if (from) renames.push({ from, to });
    }
  }
  return renames;
}

// src/wire.ts
var PROTOCOL_VERSION = 2;

// src/hub.ts
var HUB_TIMEOUT_MS = 2500;
async function hubPostRaw(hubUrl, pathName, body, timeoutMs = HUB_TIMEOUT_MS) {
  try {
    const res = await fetch(`${hubUrl.replace(/\/$/, "")}${pathName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Switchboard-Version": String(PROTOCOL_VERSION)
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  } catch {
    return null;
  }
}
async function hubPost(hubUrl, pathName, body, timeoutMs = HUB_TIMEOUT_MS) {
  const reply = await hubPostRaw(hubUrl, pathName, body, timeoutMs);
  if (reply === null || reply.status < 200 || reply.status >= 300) return null;
  return reply.body;
}

// src/strings.ts
function clock(at) {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function l1LeaseDenied(args) {
  return `${args.path} is leased by ${args.holderName}'s session until ${clock(args.expiresAt)} (local lease snapshot).`;
}
function commitBlockedByLeases(violations) {
  const lines = violations.map(
    (v) => `${v.path} is leased by ${v.holderName}'s session until ${clock(v.expiresAt)} (local snapshot).`
  );
  lines.push("The commit was not created; the leased paths remain staged.");
  return lines.join("\n");
}

// src/l1.ts
var CACHE_MAX_AGE_MS = 9e4;
function cacheIsFresh(cache, now) {
  return cache !== null && typeof cache.fetchedAt === "number" && now - cache.fetchedAt <= CACHE_MAX_AGE_MS;
}
function heldByOther(cache, relPath, now, ownSessionIds2) {
  const entry = cache.leases?.[relPath];
  if (!entry) return null;
  if (typeof entry.sessionId !== "string" || typeof entry.humanName !== "string" || typeof entry.expiresAt !== "number" || !Number.isFinite(entry.expiresAt)) {
    return null;
  }
  if (entry.expiresAt <= now) return null;
  if (ownSessionIds2.includes(entry.sessionId)) return null;
  return { path: relPath, holderName: entry.humanName, expiresAt: entry.expiresAt };
}
function decidePreL1(args) {
  const { relPath, cache, now, ownSessionIds: ownSessionIds2 } = args;
  if (relPath === null) return null;
  if (!cacheIsFresh(cache, now)) return null;
  const violation = heldByOther(cache, relPath, now, ownSessionIds2);
  if (violation === null) return null;
  return l1LeaseDenied({ path: violation.path, holderName: violation.holderName, expiresAt: violation.expiresAt });
}
function stagedLeaseViolations(args) {
  const { staged, cache, now, ownSessionIds: ownSessionIds2 } = args;
  if (!cacheIsFresh(cache, now)) return [];
  const violations = [];
  for (const relPath of staged) {
    const v = heldByOther(cache, relPath, now, ownSessionIds2);
    if (v) violations.push(v);
  }
  return violations;
}

// src/hookmain.ts
var STOP_FETCH_TIMEOUT_MS = 3e3;
var HEARTBEAT_INTERVAL_MS = (() => {
  const n = Number(process.env.SWITCHBOARD_HEARTBEAT_MS ?? "");
  return Number.isFinite(n) && n > 0 ? n : 2e4;
})();
var STDIN_MODES = /* @__PURE__ */ new Set(["pre-l1", "session-start", "post-tool-use", "stop", "session-end"]);
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    const timer = setTimeout(() => resolve(Buffer.concat(chunks).toString("utf8")), 2e3);
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}
function parseStdin(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function resolveRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
}
function emitAndExit(payload, code = 0) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(code));
}
function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return void 0;
  return argv[i + 1];
}
function toolFilePath(input) {
  const ti = input.tool_input ?? {};
  const p = ti.file_path ?? ti.notebook_path;
  return typeof p === "string" && p.length > 0 ? p : null;
}
function ownSessionIds(stdinSessionId, local) {
  const ids = [];
  if (stdinSessionId) ids.push(stdinSessionId);
  if (local?.lastSessionId) ids.push(local.lastSessionId);
  return ids;
}
function hookCommon(sessionId, local, now) {
  return {
    sessionId,
    cloneId: local?.cloneId ?? "unknown",
    machine: os.hostname(),
    at: now
  };
}
function spawnDetachedHook(root, args) {
  const hookPath = path3.join(root, ".switchboard", "hook.mjs");
  if (!existsSync(hookPath)) return null;
  try {
    const child = spawn(process.execPath, [hookPath, ...args], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root }
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}
function readPid(file) {
  try {
    const n = Number(readFileSync2(file, "utf8").trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function modePreL1(input) {
  const root = resolveRoot(input);
  const filePath = toolFilePath(input);
  const relPath = filePath === null ? null : repoRelative(root, filePath);
  const reason = decidePreL1({
    relPath,
    cache: readCache(root),
    now: Date.now(),
    ownSessionIds: ownSessionIds(input.session_id, readLocal(root))
  });
  if (reason === null) process.exit(0);
  emitAndExit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  });
}
function ensureLocal(root, sessionId) {
  const existing = readLocal(root);
  const local = existing ?? {
    cloneId: randomUUID(),
    machineToken: randomBytes(16).toString("hex")
  };
  local.lastSessionId = sessionId;
  writeLocal(root, local);
  return local;
}
function ensureWorkBranch(root, config, sessionId) {
  const branch = currentBranch(root);
  if (branch === null) return "unknown";
  if (branch !== config.baseBranch && branch !== "HEAD") return branch;
  const work = `switchboard/${sessionId.slice(0, 8)}`;
  if (!git(root, "checkout", "-b", work).ok) {
    if (!git(root, "checkout", work).ok) return branch;
  }
  return work;
}
function installPreCommitGuard(root) {
  const gitDir = git(root, "rev-parse", "--git-dir");
  if (!gitDir.ok) return;
  const hookFile = path3.resolve(root, gitDir.out, "hooks", "pre-commit");
  if (existsSync(hookFile)) {
    const current = readFileSync2(hookFile, "utf8");
    if (!current.includes(PRE_COMMIT_MARKER)) return;
  }
  const script = [
    "#!/bin/sh",
    PRE_COMMIT_MARKER,
    'exec node "$(git rev-parse --show-toplevel)/.switchboard/hook.mjs" pre-commit',
    ""
  ].join("\n");
  writeFileSync2(hookFile, script, { mode: 493 });
}
function startHeartbeat(root, sessionId) {
  const pidFile = heartbeatPidPath(root);
  const stale = readPid(pidFile);
  if (stale !== null && pidAlive(stale)) {
    try {
      process.kill(stale, "SIGTERM");
    } catch {
    }
  }
  rmSync(pidFile, { force: true });
  const pid = spawnDetachedHook(root, [
    "heartbeat",
    "--session",
    sessionId,
    "--claude-pid",
    String(process.ppid)
  ]);
  if (pid !== null) writeFileSync2(pidFile, String(pid) + "\n");
}
function registerMcpOnce(root, config, local) {
  if (local.mcpRegistered) return;
  if (process.env.SWITCHBOARD_SKIP_MCP === "1") return;
  const url = `${config.hubUrl}/v1/mcp?t=${local.machineToken}`;
  const r = spawnSync2(
    "claude",
    ["mcp", "add", "--transport", "http", "--scope", "local", "switchboard", url],
    { cwd: root, timeout: 8e3, stdio: "ignore" }
  );
  if (!r.error && r.status === 0) {
    local.mcpRegistered = true;
    writeLocal(root, local);
  }
}
async function modeSessionStart(input) {
  const root = resolveRoot(input);
  const config = readConfig(root);
  const sessionId = input.session_id;
  if (config === null || !sessionId) process.exit(0);
  const local = ensureLocal(root, sessionId);
  const workBranch = ensureWorkBranch(root, config, sessionId);
  const baseSha = mergeBaseWithLive(root, config.liveBranch) ?? headSha(root) ?? "unknown";
  local.baseSha = baseSha;
  writeLocal(root, local);
  installPreCommitGuard(root);
  startHeartbeat(root, sessionId);
  registerMcpOnce(root, config, local);
  const now = Date.now();
  const body = {
    ...hookCommon(sessionId, local, now),
    humanName: gitUserName(root) ?? os.userInfo().username,
    cwd: root,
    workBranch,
    baseSha,
    agentKind: "claude-code",
    machineToken: local.machineToken
  };
  const res = await hubPost(config.hubUrl, "/v1/hooks/session-start", body, 4500);
  if (res?.leaseSnapshot) writeCache(root, { fetchedAt: Date.now(), leases: res.leaseSnapshot });
  if (res?.context) {
    emitAndExit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: res.context } });
    return;
  }
  process.exit(0);
}
async function reRegisterSession(root, config, sessionId) {
  const local = readLocal(root);
  const now = Date.now();
  const body = {
    ...hookCommon(sessionId, local, now),
    humanName: gitUserName(root) ?? os.userInfo().username,
    cwd: root,
    workBranch: currentBranch(root) ?? "unknown",
    baseSha: mergeBaseWithLive(root, config.liveBranch) ?? headSha(root) ?? local?.baseSha ?? "unknown",
    agentKind: "claude-code",
    ...local?.machineToken ? { machineToken: local.machineToken } : {}
  };
  const res = await hubPost(config.hubUrl, "/v1/hooks/session-start", body);
  if (res?.leaseSnapshot) writeCache(root, { fetchedAt: Date.now(), leases: res.leaseSnapshot });
}
function bashExitCode(toolResponse) {
  if (typeof toolResponse !== "object" || toolResponse === null) return void 0;
  const r = toolResponse;
  for (const key of ["exit_code", "exitCode", "code"]) {
    if (typeof r[key] === "number") return r[key];
  }
  if (r.is_error === true || r.interrupted === true) return 1;
  return void 0;
}
function microCommit(root, sessionId, toolName, relPath) {
  if (!git(root, "add", "--", relPath).ok) return {};
  if (!hasStagedChanges(root)) return {};
  const renames = stagedRenames(root);
  const files = stagedFiles(root);
  const message = `[switchboard] session=${sessionId} ${toolName}: ${relPath}`;
  if (!git(root, "commit", "--no-verify", "-m", message).ok) return {};
  const sha = headSha(root);
  const branch = currentBranch(root);
  if (sha === null || branch === null) return {};
  return {
    commit: { sha, files, branch },
    ...renames.length > 0 ? { renames } : {}
  };
}
function sweptPaths(files, renames) {
  const paths = [...files];
  for (const r of renames) {
    if (!paths.includes(r.from)) paths.push(r.from);
  }
  return paths;
}
function microCommitSweep(root, sessionId) {
  const status = git(root, "status", "--porcelain", "-z");
  if (!status.ok || status.out === "") return {};
  if (!git(root, "add", "-A").ok) return {};
  if (!hasStagedChanges(root)) return {};
  const renames = stagedRenames(root);
  const files = stagedFiles(root);
  const message = `[switchboard] session=${sessionId} Bash: ${sweptPaths(files, renames).length} files`;
  if (!git(root, "commit", "--no-verify", "-m", message).ok) return {};
  const sha = headSha(root);
  const branch = currentBranch(root);
  if (sha === null || branch === null) return {};
  return {
    commit: { sha, files, branch },
    ...renames.length > 0 ? { renames } : {}
  };
}
async function modePostToolUse(input) {
  const root = resolveRoot(input);
  const config = readConfig(root);
  const sessionId = input.session_id;
  if (config === null || !sessionId) process.exit(0);
  const local = readLocal(root);
  const toolName = input.tool_name ?? "unknown";
  const filePath = toolFilePath(input);
  const relPath = filePath === null ? null : repoRelative(root, filePath);
  let commitInfo = {};
  let paths = relPath !== null ? [relPath] : [];
  if (toolName === "Bash") {
    commitInfo = microCommitSweep(root, sessionId);
    if (commitInfo.commit) {
      paths = sweptPaths(commitInfo.commit.files, commitInfo.renames ?? []);
    }
  } else if (relPath !== null) {
    commitInfo = microCommit(root, sessionId, toolName, relPath);
  }
  const command = toolName === "Bash" && typeof input.tool_input?.command === "string" ? input.tool_input.command : void 0;
  const exitCode = toolName === "Bash" ? bashExitCode(input.tool_response) : void 0;
  const now = Date.now();
  const body = {
    ...hookCommon(sessionId, local, now),
    toolName,
    paths,
    ...commitInfo,
    ...exitCode !== void 0 ? { exitCode } : {},
    ...command !== void 0 ? { command: command.slice(0, 500) } : {},
    baseSha: mergeBaseWithLive(root, config.liveBranch) ?? local?.baseSha ?? void 0
  };
  const res = await hubPost(config.hubUrl, "/v1/hooks/post-tool-use", body);
  if (res?.leaseSnapshot) writeCache(root, { fetchedAt: Date.now(), leases: res.leaseSnapshot });
  if (res?.unknownSession) await reRegisterSession(root, config, sessionId);
  spawnDetachedHook(root, ["bg-sync"]);
  if (res?.context) {
    emitAndExit({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: res.context } });
    return;
  }
  process.exit(0);
}
async function modeBgSync() {
  const root = resolveRoot({});
  const config = readConfig(root);
  if (config === null) process.exit(0);
  const pidFile = bgSyncPidPath(root);
  const running = readPid(pidFile);
  if (running !== null && running !== process.pid && pidAlive(running)) process.exit(0);
  writeFileSync2(pidFile, String(process.pid) + "\n");
  try {
    const branch = currentBranch(root);
    if (branch !== null && branch.startsWith("switchboard/")) {
      git(root, "push", "--set-upstream", "origin", branch);
    }
    git(root, "fetch", "origin", config.liveBranch);
  } finally {
    rmSync(pidFile, { force: true });
  }
  process.exit(0);
}
async function modeStop(input) {
  const root = resolveRoot(input);
  const config = readConfig(root);
  const sessionId = input.session_id;
  if (config === null || !sessionId) process.exit(0);
  const local = readLocal(root);
  const now = Date.now();
  const body = {
    ...hookCommon(sessionId, local, now),
    baseSha: mergeBaseWithLive(root, config.liveBranch) ?? local?.baseSha ?? void 0
  };
  const res = await hubPost(config.hubUrl, "/v1/hooks/stop", body);
  if (res?.pullAdvised) {
    const fetched = gitTimed(root, STOP_FETCH_TIMEOUT_MS, "fetch", "origin", config.liveBranch).ok;
    if (fetched) {
      const status = git(root, "status", "--porcelain", "--untracked-files=no");
      const treeClean = status.ok && status.out === "";
      const resetSafe = treeClean && res.syncedTip !== void 0 && headContainedIn(root, res.syncedTip);
      const pulled = resetSafe ? git(root, "reset", "--hard", `origin/${config.liveBranch}`).ok : git(root, "rebase", `origin/${config.liveBranch}`).ok;
      if (!pulled) {
        if (!resetSafe) git(root, "rebase", "--abort");
        await hubPost(config.hubUrl, "/v1/hooks/stop", { ...body, pullFailed: true });
      } else {
        const baseSha = mergeBaseWithLive(root, config.liveBranch);
        if (local !== null && baseSha !== null) {
          local.baseSha = baseSha;
          writeLocal(root, local);
        }
        await hubPost(config.hubUrl, "/v1/hooks/stop", {
          ...body,
          ...baseSha !== null ? { baseSha } : {},
          pullOk: true
        });
      }
    }
  }
  if (res?.context) {
    emitAndExit({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: res.context } });
    return;
  }
  process.exit(0);
}
async function modeSessionEnd(input) {
  const root = resolveRoot(input);
  const config = readConfig(root);
  const local = readLocal(root);
  const sessionId = input.session_id ?? local?.lastSessionId;
  if (config !== null && sessionId) {
    await hubPost(config.hubUrl, "/v1/hooks/session-end", hookCommon(sessionId, local, Date.now()));
  }
  const pidFile = heartbeatPidPath(root);
  const pid = readPid(pidFile);
  if (pid !== null) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
    }
  }
  rmSync(pidFile, { force: true });
  process.exit(0);
}
async function modeHeartbeat(argv) {
  const root = resolveRoot({});
  const config = readConfig(root);
  const sessionId = flag(argv, "session");
  if (config === null || !sessionId) process.exit(0);
  const claudePid = Number(flag(argv, "claude-pid") ?? "");
  const pidFile = heartbeatPidPath(root);
  writeFileSync2(pidFile, String(process.pid) + "\n");
  let consecutiveFailures = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (; ; ) {
    await sleep(HEARTBEAT_INTERVAL_MS);
    if (readPid(pidFile) !== process.pid) process.exit(0);
    if (Number.isInteger(claudePid) && claudePid > 0 && !pidAlive(claudePid)) {
      rmSync(pidFile, { force: true });
      process.exit(0);
    }
    const local = readLocal(root);
    const res = await hubPost(
      config.hubUrl,
      "/v1/hooks/heartbeat",
      hookCommon(sessionId, local, Date.now())
    );
    consecutiveFailures = res === null ? consecutiveFailures + 1 : 0;
    if (res?.unknownSession) await reRegisterSession(root, config, sessionId);
    if (consecutiveFailures >= 20) {
      rmSync(pidFile, { force: true });
      process.exit(0);
    }
  }
}
async function modePreCommit() {
  const root = resolveRoot({});
  const violations = stagedLeaseViolations({
    staged: stagedFiles(root),
    cache: readCache(root),
    now: Date.now(),
    ownSessionIds: ownSessionIds(void 0, readLocal(root))
  });
  if (violations.length === 0) process.exit(0);
  process.stderr.write(
    commitBlockedByLeases(
      violations.map((v) => ({ path: v.path, holderName: v.holderName, expiresAt: v.expiresAt }))
    ) + "\n",
    () => process.exit(1)
  );
}
async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0] ?? "";
  const input = STDIN_MODES.has(mode) ? parseStdin(await readStdin()) : {};
  switch (mode) {
    case "pre-l1":
      return modePreL1(input);
    case "session-start":
      return modeSessionStart(input);
    case "post-tool-use":
      return modePostToolUse(input);
    case "stop":
      return modeStop(input);
    case "session-end":
      return modeSessionEnd(input);
    case "heartbeat":
      return modeHeartbeat(argv);
    case "bg-sync":
      return modeBgSync();
    case "pre-commit":
      return modePreCommit();
    default:
      process.exit(0);
  }
}
main().catch(() => process.exit(0));
