"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTracking = isTracking;
exports.startBackgroundTracking = startBackgroundTracking;
exports.stopBackgroundTracking = stopBackgroundTracking;
exports.pollOnce = pollOnce;
/**
 * background.ts — silent, headless-safe activity poller.
 *
 * When enabled via config (backgroundTracking), it periodically snapshots the
 * git HEAD/branch and the set of tracked+working files, diffs against the last
 * snapshot, and records new commits, branch switches, and file changes through
 * the tracker. It never writes to stdout/stderr and never interrupts Claude.
 */
const config_1 = require("../config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const git_1 = require("./git");
const tracker_1 = require("./tracker");
const config_2 = require("../config");
const POLL_INTERVAL_MS = 15000;
let timer = null;
let running = false;
let polling = false;
let cwdRef = process.cwd();
let snapshot = {
    commitHashes: new Set(),
    changedFiles: new Set(),
    initialized: false,
};
/** True while the background poller is active. */
function isTracking() {
    return running;
}
/** Diff a fresh git context against the last snapshot and record deltas. */
function reconcile(ctx) {
    if (!ctx.isRepo)
        return;
    const nextCommits = new Set();
    const commits = ctx.recentCommits || [];
    for (const c of commits)
        nextCommits.add(c.hash);
    const nextChanged = new Set(ctx.changedFiles || []);
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
        (0, tracker_1.track)("command", `Switched branch to ${ctx.branch}`, {
            from: snapshot.branch,
            to: ctx.branch,
        });
    }
    // New commits (present now, absent before).
    for (const c of commits) {
        if (!snapshot.commitHashes.has(c.hash)) {
            (0, tracker_1.trackCommit)(c.subject || c.hash.slice(0, 8), {
                hash: c.hash,
                branch: ctx.branch,
                date: c.date,
            });
        }
    }
    // Newly changed working-tree files (present now, absent before).
    for (const f of nextChanged) {
        if (!snapshot.changedFiles.has(f)) {
            (0, tracker_1.track)("file-edited", f, { file: f });
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
async function poll() {
    if (polling)
        return;
    polling = true;
    try {
        const ctx = await (0, git_1.getGitContext)(cwdRef);
        reconcile(ctx);
    }
    catch {
        /* silent — the poller must never surface errors */
    }
    finally {
        polling = false;
    }
}
/**
 * Start silent background tracking for `cwd` (defaults to process.cwd()).
 * No-op if disabled in config or already running. Safe to run headless.
 */
async function startBackgroundTracking(cwd) {
    if (running)
        return;
    let enabled = true;
    try {
        enabled = (0, config_1.loadConfig)().backgroundTracking !== false;
    }
    catch {
        enabled = false;
    }
    if (!enabled)
        return;
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
    if (timer.unref)
        timer.unref();
}
/** Stop the background poller. Idempotent. */
function stopBackgroundTracking() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    running = false;
}
function snapshotPath() {
    return path.join((0, config_2.storageDir)(), "snapshot.json");
}
function loadPersistedSnapshot() {
    try {
        const parsed = JSON.parse(fs.readFileSync(snapshotPath(), "utf8"));
        if (parsed && Array.isArray(parsed.commitHashes) && Array.isArray(parsed.changedFiles)) {
            return parsed;
        }
    }
    catch {
        /* no snapshot yet, or unreadable — treat as first run */
    }
    return null;
}
function savePersistedSnapshot(s) {
    try {
        (0, config_2.ensureDirs)();
        fs.writeFileSync(snapshotPath(), JSON.stringify(s, null, 2) + "\n", "utf8");
    }
    catch {
        /* swallow — tracking must never break the caller */
    }
}
/**
 * Run a single git reconcile against a disk-persisted snapshot. Records new
 * commits, branch switches, and newly-changed working-tree files, then saves
 * the new snapshot. Silent and never throws — safe to call from a hook.
 */
async function pollOnce(cwd) {
    let ctx;
    try {
        ctx = await (0, git_1.getGitContext)(cwd || process.cwd());
    }
    catch {
        return;
    }
    if (!ctx.isRepo)
        return;
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
        (0, tracker_1.track)("command", `Switched branch to ${ctx.branch}`, {
            from: prev.branch,
            to: ctx.branch,
        });
    }
    for (const c of commits) {
        if (!seenCommits.has(c.hash)) {
            (0, tracker_1.trackCommit)(c.subject || c.hash.slice(0, 8), {
                hash: c.hash,
                branch: ctx.branch,
                date: c.date,
            });
        }
    }
    for (const f of nextChanged) {
        if (!seenChanged.has(f)) {
            (0, tracker_1.track)("file-edited", f, { file: f });
        }
    }
    savePersistedSnapshot({
        branch: ctx.branch,
        commitHashes: nextCommits,
        changedFiles: nextChanged,
    });
}
