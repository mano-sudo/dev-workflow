/**
 * background.ts — silent, headless-safe activity poller.
 *
 * When enabled via config (backgroundTracking), it periodically snapshots the
 * git HEAD/branch and the set of tracked+working files, diffs against the last
 * snapshot, and records new commits, branch switches, and file changes through
 * the tracker. It never writes to stdout/stderr and never interrupts Claude.
 */
import { loadConfig } from "../config";
import { getGitContext } from "./git";
import { trackCommit, track } from "./tracker";
import { GitContext } from "../types";

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
