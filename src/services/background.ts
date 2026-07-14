/**
 * background.ts — silent, headless-safe activity poller.
 *
 * When enabled via config (backgroundTracking), it periodically snapshots the
 * git HEAD/branch and the set of tracked+working files, diffs against the last
 * snapshot, and records new commits, branch switches, and file changes through
 * the tracker. It never writes to stdout/stderr and never interrupts Claude.
 */
import { loadConfig } from "../config";
import * as fs from "fs";
import * as path from "path";
import { getGitContext } from "./git";
import { trackCommit, track } from "./tracker";
import { GitContext } from "../types";
import { storageDir, ensureDirs } from "../config";

const POLL_INTERVAL_MS = 15_000;

interface Snapshot {
  branch?: string;
  commitHashes: Set<string>;
  changedFiles: Set<string>;
  initialized: boolean;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let polling = false;
let cwdRef = process.cwd();
let snapshot: Snapshot = {
  commitHashes: new Set(),
  changedFiles: new Set(),
  initialized: false,
};

/** True while the background poller is active. */
export function isTracking(): boolean {
  return running;
}

/** Diff a fresh git context against the last snapshot and record deltas. */
function reconcile(ctx: GitContext): void {
  if (!ctx.isRepo) return;

  const nextCommits = new Set<string>();
  const commits = ctx.recentCommits || [];
  for (const c of commits) nextCommits.add(c.hash);

  const nextChanged = new Set<string>(ctx.changedFiles || []);

  // On the very first poll, prime the snapshot without emitting noise.
  if (!snapshot.initialized) {
    snapshot = {
      branch: ctx.branch,
      commitHashes: nextCommits,
      changedFiles: nextChanged,
      initialized: true,
    };
    return;
  }

  // Branch switch.
  if (ctx.branch && ctx.branch !== snapshot.branch) {
    track("command", `Switched branch to ${ctx.branch}`, {
      from: snapshot.branch,
      to: ctx.branch,
    });
  }

  // New commits (present now, absent before).
  for (const c of commits) {
    if (!snapshot.commitHashes.has(c.hash)) {
      trackCommit(c.subject || c.hash.slice(0, 8), {
        hash: c.hash,
        branch: ctx.branch,
        date: c.date,
      });
    }
  }

  // Newly changed working-tree files (present now, absent before).
  for (const f of nextChanged) {
    if (!snapshot.changedFiles.has(f)) {
      track("file-edited", f, { file: f });
    }
  }

  snapshot = {
    branch: ctx.branch,
    commitHashes: nextCommits,
    changedFiles: nextChanged,
    initialized: true,
  };
}

/** Run a single poll cycle; guarded against overlap and never throws. */
async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const ctx = await getGitContext(cwdRef);
    reconcile(ctx);
  } catch {
    /* silent — the poller must never surface errors */
  } finally {
    polling = false;
  }
}

/**
 * Start silent background tracking for `cwd` (defaults to process.cwd()).
 * No-op if disabled in config or already running. Safe to run headless.
 */
export async function startBackgroundTracking(cwd?: string): Promise<void> {
  if (running) return;

  let enabled = true;
  try {
    enabled = loadConfig().backgroundTracking !== false;
  } catch {
    enabled = false;
  }
  if (!enabled) return;

  cwdRef = cwd || process.cwd();
  snapshot = {
    commitHashes: new Set(),
    changedFiles: new Set(),
    initialized: false,
  };
  running = true;

  // Prime immediately so the first real change is captured.
  await poll();

  timer = setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);

  // Do not keep the event loop alive on our account.
  if (timer.unref) timer.unref();
}

/** Stop the background poller. Idempotent. */
export function stopBackgroundTracking(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}

/* ------------------------------------------------------------------ *
 * One-shot sync (for short-lived hook processes).
 *
 * A Claude Code hook runs in a fresh process each time, so the in-memory
 * `snapshot` above never survives. pollOnce() persists the last-seen git
 * state to disk (storageDir/snapshot.json), diffs the current state against
 * it, records the deltas through the tracker, and saves the new state.
 * ------------------------------------------------------------------ */

interface PersistedSnapshot {
  branch?: string;
  commitHashes: string[];
  changedFiles: string[];
}

function snapshotPath(): string {
  return path.join(storageDir(), "snapshot.json");
}

function loadPersistedSnapshot(): PersistedSnapshot | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotPath(), "utf8"));
    if (parsed && Array.isArray(parsed.commitHashes) && Array.isArray(parsed.changedFiles)) {
      return parsed as PersistedSnapshot;
    }
  } catch {
    /* no snapshot yet, or unreadable — treat as first run */
  }
  return null;
}

function savePersistedSnapshot(s: PersistedSnapshot): void {
  try {
    ensureDirs();
    fs.writeFileSync(snapshotPath(), JSON.stringify(s, null, 2) + "\n", "utf8");
  } catch {
    /* swallow — tracking must never break the caller */
  }
}

/**
 * Run a single git reconcile against a disk-persisted snapshot. Records new
 * commits, branch switches, and newly-changed working-tree files, then saves
 * the new snapshot. Silent and never throws — safe to call from a hook.
 */
export async function pollOnce(cwd?: string): Promise<void> {
  let ctx: GitContext;
  try {
    ctx = await getGitContext(cwd || process.cwd());
  } catch {
    return;
  }
  if (!ctx.isRepo) return;

  const commits = ctx.recentCommits || [];
  const nextCommits = commits.map((c) => c.hash);
  const nextChanged = ctx.changedFiles || [];
  const prev = loadPersistedSnapshot();

  // First run for this storage: prime silently so we never dump history.
  if (!prev) {
    savePersistedSnapshot({
      branch: ctx.branch,
      commitHashes: nextCommits,
      changedFiles: nextChanged,
    });
    return;
  }

  const seenCommits = new Set(prev.commitHashes);
  const seenChanged = new Set(prev.changedFiles);

  if (ctx.branch && ctx.branch !== prev.branch) {
    track("command", `Switched branch to ${ctx.branch}`, {
      from: prev.branch,
      to: ctx.branch,
    });
  }

  for (const c of commits) {
    if (!seenCommits.has(c.hash)) {
      trackCommit(c.subject || c.hash.slice(0, 8), {
        hash: c.hash,
        branch: ctx.branch,
        date: c.date,
      });
    }
  }

  for (const f of nextChanged) {
    if (!seenChanged.has(f)) {
      track("file-edited", f, { file: f });
    }
  }

  savePersistedSnapshot({
    branch: ctx.branch,
    commitHashes: nextCommits,
    changedFiles: nextChanged,
  });
}
