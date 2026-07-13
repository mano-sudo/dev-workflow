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
exports.run = run;
/**
 * /status — print today's progress at a glance.
 *
 * Combines the tracked session (today's activities) with git context to show
 * Completed / In Progress / Pending work, an estimated completion, and hours.
 * Console output only; never writes files.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const session_1 = require("../services/session");
const git_1 = require("../services/git");
function parseArgs(args) {
    const flags = {};
    const bools = new Set();
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith("--"))
            continue;
        const body = a.slice(2);
        const eq = body.indexOf("=");
        if (eq >= 0)
            flags[body.slice(0, eq)] = body.slice(eq + 1);
        else
            bools.add(body);
    }
    return { flags, bools };
}
const DONE_TYPES = new Set(["feature", "bugfix", "refactor", "test", "commit"]);
const PROGRESS_TYPES = new Set([
    "file-created",
    "file-edited",
    "file-deleted",
    "build",
    "command",
    "package",
    "migration",
]);
function heading(s) {
    return `\n\x1b[1m${s}\x1b[0m`;
}
function bullet(s) {
    return `  • ${s}`;
}
/** Estimate hours from activity count (~0.5h per activity, capped). */
function estimateHours(entries) {
    const raw = entries.length * 0.5;
    return Math.round(raw * 10) / 10;
}
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
/** A 20-cell progress bar for a 0–100 percentage. */
function progressBar(pct) {
    const width = 20;
    const filled = Math.round((pct / 100) * width);
    return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${pct}%`;
}
const iso = (d) => d.toISOString().slice(0, 10);
/**
 * Look in completed.json for reports already generated today, so status can
 * show whether the checklist / worklog for today exist yet.
 */
function reportsToday() {
    const out = { checklist: false, worklog: false };
    try {
        const p = path.join((0, config_1.storageDir)(), "completed.json");
        const list = JSON.parse(fs.readFileSync(p, "utf8"));
        if (!Array.isArray(list))
            return out;
        const today = iso(new Date());
        for (const rec of list) {
            const d = rec?.date || String(rec?.timestamp || "").slice(0, 10);
            if (d !== today || rec?.blank)
                continue;
            if (rec?.kind === "checklist")
                out.checklist = true;
            if (rec?.kind === "worklog")
                out.worklog = true;
        }
    }
    catch {
        /* none */
    }
    return out;
}
async function run(args) {
    parseArgs(args);
    const cfg = (0, config_1.loadConfig)();
    const cwd = process.cwd();
    let entries = [];
    try {
        entries = await (0, session_1.todaysActivities)();
    }
    catch {
        entries = [];
    }
    const completed = [];
    const inProgress = [];
    const notes = [];
    for (const e of entries) {
        const line = `${e.time}  ${e.description}`;
        if (DONE_TYPES.has(e.type))
            completed.push(line);
        else if (PROGRESS_TYPES.has(e.type))
            inProgress.push(line);
        else
            notes.push(line);
    }
    const pending = [];
    let branch;
    try {
        const git = await (0, git_1.getGitContext)(cwd);
        branch = git.branch;
        if (git.changedFiles) {
            for (const f of git.changedFiles)
                pending.push(`Uncommitted: ${f}`);
        }
    }
    catch {
        /* git optional */
    }
    const today = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const totalItems = completed.length + inProgress.length + pending.length;
    const pct = totalItems === 0
        ? 0
        : Math.round((completed.length / totalItems) * 100);
    console.log(`\x1b[1mTODAY'S PROGRESS\x1b[0m — ${today}`);
    const ctx = [];
    ctx.push(`project: ${path.basename(cwd)}`);
    if (branch)
        ctx.push(`branch: ${branch}`);
    if (!cfg.backgroundTracking)
        ctx.push("tracking: OFF");
    console.log(dim(ctx.join("  ·  ")));
    console.log(`\n  ${progressBar(pct)}   ${green(String(completed.length))} done · ${inProgress.length} in progress · ${pending.length} pending`);
    console.log(heading(`COMPLETED (${completed.length})`));
    if (completed.length)
        completed.forEach((l) => console.log(bullet(l)));
    else
        console.log(dim("  (nothing tracked as completed yet)"));
    console.log(heading(`IN PROGRESS (${inProgress.length})`));
    if (inProgress.length)
        inProgress.forEach((l) => console.log(bullet(l)));
    else
        console.log(dim("  (nothing in progress)"));
    console.log(heading(`PENDING (${pending.length})`));
    if (pending.length)
        pending.forEach((l) => console.log(bullet(l)));
    else
        console.log(dim("  (no pending git changes)"));
    if (notes.length) {
        console.log(heading(`NOTES (${notes.length})`));
        notes.forEach((l) => console.log(bullet(l)));
    }
    // Which of today's reports already exist?
    const rep = reportsToday();
    console.log(heading("TODAY'S REPORTS"));
    console.log(`  Checklist: ${rep.checklist ? green("✓ generated") : dim("✗ not yet — run /checklist")}`);
    console.log(`  Worklog:   ${rep.worklog ? green("✓ generated") : dim("✗ not yet — run /worklog")}`);
    console.log(heading("SUMMARY"));
    const est = pct >= 100
        ? "Complete"
        : pending.length + inProgress.length === 0
            ? "No open work"
            : `${pending.length + inProgress.length} item(s) remaining`;
    console.log(`  Progress:             ${pct}% (${completed.length}/${totalItems || 0})`);
    console.log(`  Estimated completion: ${est}`);
    console.log(`  Hours worked:         ~${estimateHours(entries)} h`);
    console.log(dim(`\n  Reports → checklists: ${(0, config_1.resolveReportDir)(cfg, "checklist")}`));
    console.log(dim(`            worklogs:   ${(0, config_1.resolveReportDir)(cfg, "worklog")}`));
    console.log("");
}
