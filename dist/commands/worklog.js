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
 * /worklog — generate a Development Worklog for the day.
 *
 * The worklog auto-generates from what was actually completed today (tracked
 * session activity + git commits). In a terminal the developer can review and
 * add to that baseline (extra accomplishments, blockers, next priorities,
 * hours, status); pass --auto to accept the generated worklog as-is.
 * Exports as PDF / Markdown / HTML per config + flags.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const os = __importStar(require("os"));
const checklistLoader_1 = require("../services/checklistLoader");
const config_1 = require("../config");
const pdfExporter_1 = require("../services/pdfExporter");
const templateEngine_1 = require("../services/templateEngine");
const git_1 = require("../services/git");
const session_1 = require("../services/session");
function parseArgs(args) {
    const flags = {};
    const bools = new Set();
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith("--"))
            continue;
        const body = a.slice(2);
        const eq = body.indexOf("=");
        if (eq >= 0) {
            flags[body.slice(0, eq)] = body.slice(eq + 1);
        }
        else {
            const next = args[i + 1];
            if (next && !next.startsWith("--")) {
                flags[body] = next;
                i++;
            }
            else {
                bools.add(body);
            }
        }
    }
    return { flags, bools };
}
function hasTTY() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
function ask(rl, q) {
    return new Promise((resolve) => rl.question(q, (a) => resolve(a)));
}
function humanDate(d = new Date()) {
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}
function normalizeFormat(v, fallback) {
    const f = (v || "").toLowerCase();
    if (f === "pdf" || f === "markdown" || f === "md" || f === "docx" || f === "html") {
        return f;
    }
    return fallback;
}
function slug(s) {
    return (s
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase() || "PROJECT");
}
function fileStem(developer, date) {
    const last = developer.trim().split(/\s+/).pop() || developer;
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${slug(last)}_WORKLOG_${mm}-${dd}-${yyyy}`;
}
/** Cap the reported day at a standard workday — elapsed span includes breaks. */
const MAX_WORKDAY_HOURS = 8;
/**
 * Estimate time buckets from the day's activity. The TOTAL is the real elapsed
 * span between the first and last tracked activity (clamped to a sane workday),
 * NOT the sum of a fixed per-activity estimate — a hundred small commits must
 * not add up to a 70-hour day. That span is then split across the buckets in
 * proportion to how many activities fell in each.
 */
function timeFromActivities(entries) {
    const t = {
        planning: 0,
        development: 0,
        testing: 0,
        bugFixes: 0,
        meetings: 0,
        total: 0,
    };
    if (entries.length === 0)
        return t;
    // Distribute across meaningful work types only — a day of many tiny commits
    // and file-edits shouldn't drown out bug-fix/testing time.
    const counts = { planning: 0, development: 0, testing: 0, bugFixes: 0, meetings: 0 };
    for (const e of entries) {
        switch (e.type) {
            case "test":
                counts.testing += 1;
                break;
            case "bugfix":
                counts.bugFixes += 1;
                break;
            case "note":
                counts.planning += 1;
                break;
            case "feature":
            case "refactor":
                counts.development += 1;
                break;
            default:
                // commits, file edits, commands, builds, etc. — process noise, not a
                // work category; ignored for the time split.
                break;
        }
    }
    const toMin = (hm) => {
        const [h, m] = (hm || "").split(":").map((n) => parseInt(n, 10));
        return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };
    const mins = entries.map((e) => toMin(e.time)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    const spanH = mins.length >= 2 ? (mins[mins.length - 1] - mins[0]) / 60 : 1;
    const hours = Math.max(0.5, Math.min(spanH, MAX_WORKDAY_HOURS));
    const totalCount = counts.planning + counts.development + counts.testing + counts.bugFixes + counts.meetings || 1;
    const round = (x) => Math.round(x * 2) / 2;
    t.planning = round((hours * counts.planning) / totalCount);
    t.development = round((hours * counts.development) / totalCount);
    t.testing = round((hours * counts.testing) / totalCount);
    t.bugFixes = round((hours * counts.bugFixes) / totalCount);
    t.meetings = round((hours * counts.meetings) / totalCount);
    t.total = round(t.planning + t.development + t.testing + t.bugFixes + t.meetings);
    return t;
}
/** Build worklog content from the tracked session + git context. */
async function buildFromSession(cwd, dateISO) {
    const raw = dateISO ? (0, session_1.activitiesForDate)(dateISO) : (0, session_1.todaysActivities)();
    // Dedup (the completed-day archive can hold the same entry more than once)
    // and drop malformed/typeless rows before bucketing.
    const seen = new Set();
    const entries = raw.filter((e) => {
        if (!e.type || !e.description || !e.description.trim())
            return false;
        const key = `${e.time}|${e.type}|${e.description}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    const checklistItems = [];
    const additional = [];
    // Low-signal event types that would just be noise as task rows.
    const NOISE = new Set(["commit", "file-created", "file-edited", "file-deleted", "command", "build"]);
    for (const e of entries) {
        if (e.type === "feature" || e.type === "bugfix" || e.type === "refactor") {
            // The Result column shows the real outcome when captured (`track … :: result`),
            // falling back to the activity type — never the opaque "type at time".
            checklistItems.push({ task: e.description, status: "Completed", result: e.result || e.type });
        }
        else if (!NOISE.has(e.type)) {
            // Additional items only show a real captured result (no type fallback).
            additional.push({ task: e.description, status: "Completed", result: e.result });
        }
    }
    let summary = "";
    const next = [];
    try {
        const git = await (0, git_1.getGitContext)(cwd);
        if (git.changedFiles && git.changedFiles.length) {
            next.push(`Finish/commit ${git.changedFiles.length} pending change(s) in progress`);
        }
        if (git.branch)
            summary = `Work on branch ${git.branch}.`;
    }
    catch {
        /* git optional */
    }
    return {
        checklistItems,
        additional,
        next,
        time: timeFromActivities(entries),
        summary,
    };
}
async function collectList(rl, label) {
    const out = [];
    process.stdout.write(`\n${label} (one per line, blank to finish):\n`);
    for (;;) {
        const line = (await ask(rl, "  - ")).trim();
        if (!line)
            break;
        out.push(line);
    }
    return out;
}
function expandHome(p) {
    const s = p.trim().replace(/^['"]|['"]$/g, "");
    if (s === "~")
        return os.homedir();
    if (s.startsWith("~/") || s.startsWith("~\\"))
        return path.join(os.homedir(), s.slice(2));
    return s;
}
/** Text corpus of what we know got done, for auto-guessing task completion. */
function signalText(auto) {
    const parts = [];
    for (const c of auto.checklistItems ?? [])
        parts.push(c.task, c.result ?? "");
    for (const a of auto.additional ?? [])
        parts.push(a.task, a.result ?? "");
    return parts.join(" \n ").toLowerCase();
}
/** Guess a planned task's completion by word overlap with the signal text. */
function autoStatusFor(task, signal) {
    const words = task.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    if (words.length === 0)
        return "Not Done";
    const hits = words.filter((w) => signal.includes(w)).length;
    return hits >= Math.max(1, Math.ceil(words.length * 0.4)) ? "Completed" : "Not Done";
}
/** Non-interactive reconciliation: auto-mark each planned task. */
function reconcileAuto(tasks, signal) {
    return tasks.map((t) => ({ task: t.task, status: autoStatusFor(t.task, signal) }));
}
/** Interactive reconciliation: mark each planned task Completed/Partial/Not Done. */
async function reconcileInteractive(rl, tasks, signal) {
    process.stdout.write(`\nReconcile ${tasks.length} planned task(s) from the checklist ` +
        `— c=Completed, p=Partial, n=Not Done (a guess is pre-filled):\n`);
    const items = [];
    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const guess = autoStatusFor(t.task, signal);
        const gk = guess === "Completed" ? "c" : "n";
        process.stdout.write(`\n  ${i + 1}/${tasks.length}. ${t.task}\n`);
        const ans = (await ask(rl, `     status [c/p/n] (default ${gk}): `)).trim().toLowerCase();
        const status = ans.startsWith("c")
            ? "Completed"
            : ans.startsWith("p")
                ? "Partial"
                : ans.startsWith("n")
                    ? "Not Done"
                    : guess;
        const result = (await ask(rl, "     result / detail (optional): ")).trim();
        items.push({ task: t.task, status, result: result || undefined });
    }
    return items;
}
/** Type completed tasks one at a time (task text + optional result). */
async function collectChecklistItems(rl, label) {
    const out = [];
    process.stdout.write(`\n${label} — type one at a time, blank to finish.\n`);
    for (;;) {
        const task = (await ask(rl, `\n  Completed task ${out.length + 1}: `)).trim();
        if (!task)
            break;
        const result = (await ask(rl, "    Result / detail (optional): ")).trim();
        out.push({ task, status: "Completed", result: result || undefined });
        process.stdout.write(`    ✓ ${task}\n`);
    }
    return out;
}
/**
 * Interactive worklog builder that STARTS from what was auto-detected
 * (tracked completed tasks + git) and lets the developer add to it, rather
 * than typing everything from scratch.
 */
async function enrichWorklogInteractive(rl, auto) {
    const autoCompleted = auto.checklistItems ?? [];
    const doneCount = autoCompleted.filter((c) => c.status === "Completed").length;
    process.stdout.write(`\nChecklist so far — ${autoCompleted.length} task(s), ${doneCount} completed:\n`);
    if (autoCompleted.length === 0) {
        process.stdout.write("  (nothing yet — add tasks below)\n");
    }
    else {
        autoCompleted.forEach((c, i) => process.stdout.write(`  ${i + 1}. [${c.status}] ${c.task}${c.result ? ` — ${c.result}` : ""}\n`));
    }
    const extraCompleted = await collectChecklistItems(rl, "Add any completed tasks that weren't tracked");
    const checklistItems = [...autoCompleted, ...extraCompleted];
    const additional = [
        ...(auto.additional ?? []),
        ...(await collectChecklistItems(rl, "Additional work done (beyond the plan)")),
    ];
    const notCompleted = await collectList(rl, "Tasks NOT completed");
    const blockers = await collectList(rl, "Blockers");
    const next = [
        ...(auto.next ?? []),
        ...(await collectList(rl, "Next priorities")),
    ];
    const notes = await collectList(rl, "Notes");
    const autoHours = auto.time?.total;
    const hoursRaw = (await ask(rl, `\nTotal hours worked [${autoHours ? String(autoHours) : "e.g. 6.5"}]: `)).trim();
    const total = hoursRaw ? Number(hoursRaw) : autoHours;
    const time = total && Number.isFinite(total) ? { ...auto.time, total } : auto.time ?? {};
    const statusRaw = (await ask(rl, "Overall status [1=On Schedule, 2=Slight Delay, 3=Delayed] (default 1): ")).trim();
    const status = statusRaw === "2" ? "Slight Delay" : statusRaw === "3" ? "Delayed" : "On Schedule";
    return {
        checklistItems,
        additional,
        notCompleted,
        blockers,
        next,
        notes,
        time,
        status,
        summary: auto.summary,
    };
}
async function exportWorklog(worklog, outDir, format, cfg, blank, noClobber = false, dateObj = new Date()) {
    const stem = fileStem(worklog.developer || "developer", dateObj);
    const written = [];
    if (format === "pdf") {
        const out = (0, config_1.prepareOutPath)(path.join(outDir, `${stem}.pdf`), { noClobber });
        await (0, pdfExporter_1.renderWorklogPDF)(worklog, out, { blank });
        written.push(out);
        return written;
    }
    const tpl = (0, templateEngine_1.loadTemplate)("worklog", cfg.template);
    const data = (0, templateEngine_1.worklogToTemplateData)(worklog);
    const md = (0, templateEngine_1.render)(tpl, data);
    if (format === "markdown" || format === "md" || format === "docx") {
        const ext = format === "docx" ? "doc.md" : "md";
        const out = (0, config_1.prepareOutPath)(path.join(outDir, `${stem}.${ext}`), { noClobber });
        fs.writeFileSync(out, md, "utf8");
        written.push(out);
    }
    if (format === "html") {
        const out = (0, config_1.prepareOutPath)(path.join(outDir, `${stem}.html`), { noClobber });
        fs.writeFileSync(out, (0, templateEngine_1.toHTML)(md), "utf8");
        written.push(out);
    }
    return written;
}
function recordCompleted(files, meta) {
    try {
        (0, config_1.ensureDirs)();
        const p = path.join((0, config_1.storageDir)(), "completed.json");
        let list = [];
        try {
            list = JSON.parse(fs.readFileSync(p, "utf8"));
            if (!Array.isArray(list))
                list = [];
        }
        catch {
            list = [];
        }
        const now = new Date();
        list.push({
            kind: "worklog",
            files,
            date: now.toISOString().slice(0, 10),
            timestamp: now.toISOString(),
            ...meta,
        });
        fs.writeFileSync(p, JSON.stringify(list, null, 2) + "\n", "utf8");
    }
    catch {
        /* ignore */
    }
}
async function run(args) {
    const { flags, bools } = parseArgs(args);
    const cfg = (0, config_1.loadConfig)();
    const cwd = process.cwd();
    const outDir = flags.out
        ? path.resolve(cwd, flags.out)
        : (0, config_1.resolveReportDir)(cfg, "worklog");
    fs.mkdirSync(outDir, { recursive: true });
    const blank = bools.has("blank");
    const noClobber = bools.has("no-clobber");
    const format = normalizeFormat(flags.format, cfg.export);
    const date = flags.date ? new Date(flags.date) : new Date();
    const developer = flags.developer || cfg.developer || "Developer";
    const project = flags.project || path.basename(cwd);
    const sprint = flags.sprint || "Sprint";
    const base = {
        project,
        developer,
        date: humanDate(date),
        sprint,
        subtitle: flags.subtitle ||
            "Filled in **at the end** of the session — the full record of what actually happened.",
        checklistItems: [],
        checklistRef: flags.checklistRef,
        additional: [],
        notCompleted: [],
        blockers: [],
        next: [],
        time: {},
        status: "On Schedule",
        notes: [],
    };
    if (blank) {
        const empty = {
            ...base,
            project: "",
            // Used only for the filename; blank render leaves the meta grid empty.
            developer,
            date: "",
            sprint: "",
            subtitle: "",
        };
        const written = await exportWorklog(empty, outDir, format, cfg, true, noClobber);
        recordCompleted(written, { blank: true });
        console.log(`Blank worklog written:\n  ${written.join("\n  ")}`);
        return;
    }
    // Always auto-generate from what was actually completed on the target day
    // (tracked activity + git commits). --date regenerates a past day.
    const targetISO = flags.date
        ? new Date(flags.date).toISOString().slice(0, 10)
        : undefined;
    let content = await buildFromSession(cwd, targetISO);
    const autoOnly = bools.has("auto") || bools.has("yes");
    const interactive = !autoOnly && hasTTY();
    let checklistPath = flags.checklist || flags["from-checklist"] || flags.reconcile || flags.against;
    const rl = interactive
        ? readline.createInterface({ input: process.stdin, output: process.stdout })
        : undefined;
    try {
        // If no checklist was passed, offer to paste one in an interactive session.
        if (!checklistPath && rl) {
            const ans = (await ask(rl, "\nReconcile against an existing checklist? Paste its file path (PDF/MD/JSON), or Enter to skip: ")).trim();
            if (ans)
                checklistPath = ans;
        }
        // Reconcile the worklog's CHECKLIST COMPLETION table against that checklist.
        if (checklistPath) {
            try {
                const loaded = await (0, checklistLoader_1.loadChecklistFromFile)(expandHome(checklistPath));
                if (loaded.tasks.length > 0) {
                    const signal = signalText(content);
                    const planned = new Set(loaded.tasks.map((t) => t.task.toLowerCase()));
                    // Tracked-completed work that isn't a planned task becomes "additional".
                    const extra = (content.checklistItems ?? []).filter((c) => !planned.has(c.task.toLowerCase()));
                    // --not-done: mark every planned task Not Done (skip the guess).
                    // Use when the checklist is planned work that hasn't been executed
                    // yet, so the completion table reflects reality, not word overlap.
                    const assumeNotDone = bools.has("not-done");
                    content.checklistItems = assumeNotDone
                        ? loaded.tasks.map((t) => ({
                            task: t.task,
                            status: "Not Done",
                        }))
                        : rl
                            ? await reconcileInteractive(rl, loaded.tasks, signal)
                            : reconcileAuto(loaded.tasks, signal);
                    content.additional = [...(content.additional ?? []), ...extra];
                    content.checklistRef = loaded.stem;
                    const done = content.checklistItems.filter((c) => c.status === "Completed").length;
                    console.log(`✓ Reconciled against ${loaded.stem}: ${done}/${loaded.tasks.length} completed.`);
                }
                else {
                    console.warn("⚠ Couldn't read tasks from that checklist — continuing without reconciliation.");
                }
            }
            catch (err) {
                console.warn(`⚠ ${err.message}`);
            }
        }
        // Let the developer review and add to the auto-detected work.
        if (rl)
            content = await enrichWorklogInteractive(rl, content);
    }
    finally {
        if (rl)
            rl.close();
    }
    const worklog = { ...base, ...content };
    const written = await exportWorklog(worklog, outDir, format, cfg, false, noClobber, date);
    recordCompleted(written, { project });
    console.log(`Worklog generated (${worklog.checklistItems.length} completed item(s)):\n  ${written.join("\n  ")}`);
}
