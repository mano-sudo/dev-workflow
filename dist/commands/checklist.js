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
exports.recordCompleted = recordCompleted;
/**
 * /checklist — generate a Development Checklist.
 *
 * Builds a Checklist object from one of several sources (manual entry, repo
 * scan, a spec file, a previous report, or an AI-assisted flow) and exports it
 * as PDF / Markdown / HTML according to config + flags.
 *
 * Never invents completed work: task state comes only from git, the scanner,
 * the tracked session, or explicit user input.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const config_1 = require("../config");
const pdfExporter_1 = require("../services/pdfExporter");
const templateEngine_1 = require("../services/templateEngine");
const git_1 = require("../services/git");
const repositoryScanner_1 = require("../services/repositoryScanner");
const session_1 = require("../services/session");
/** Parse `--key=value`, `--key value`, and `--flag` style arguments. */
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
/** "July 11, 2026" for a given Date (defaults to today). */
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
/** Sanitize a project label into an uppercase file stem token. */
function slug(s) {
    return (s
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase() || "PROJECT");
}
/** Build the canonical file stem, e.g. CASERES_CHECKLIST_07-11-2026. */
function fileStem(developer, date) {
    const last = developer.trim().split(/\s+/).pop() || developer;
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${slug(last)}_CHECKLIST_${mm}-${dd}-${yyyy}`;
}
function priorityFromFinding(p) {
    if (p === "critical" || p === "high")
        return "High";
    if (p === "medium")
        return "Medium";
    return "Low";
}
/** Derive planned (Not Started) tasks from scanner findings + git changes. */
async function buildFromScan(cwd) {
    const tasks = [];
    let branch;
    try {
        const findings = await (0, repositoryScanner_1.scanRepository)(cwd);
        for (const f of findings) {
            tasks.push({
                status: "Not Started",
                priority: priorityFromFinding(f.priority),
                task: f.message,
                notes: [f.category, f.file ? f.file + (f.line ? `:${f.line}` : "") : ""]
                    .filter(Boolean)
                    .join(" — "),
            });
        }
    }
    catch {
        /* scanner is best-effort */
    }
    try {
        const git = await (0, git_1.getGitContext)(cwd);
        branch = git.branch;
        if (git.changedFiles && git.changedFiles.length && tasks.length === 0) {
            // Fall back to changed files as work-in-progress items.
            for (const file of git.changedFiles.slice(0, 20)) {
                tasks.push({
                    status: "In Progress",
                    priority: "Medium",
                    task: `Review/complete changes in ${file}`,
                    notes: "Uncommitted change detected by git",
                });
            }
        }
    }
    catch {
        /* git is best-effort */
    }
    return { tasks, branch };
}
/** Read a spec/markdown file and turn "- [ ] task" / "- task" lines into tasks. */
function buildFromSpec(specPath) {
    const raw = fs.readFileSync(specPath, "utf8");
    const tasks = [];
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(?:\[( |x|X)\]\s+)?(.*\S)\s*$/);
        if (!m)
            continue;
        const checked = m[1] && m[1].toLowerCase() === "x";
        const text = m[2];
        // Never invent completed work: a spec's checked box is explicit user input.
        tasks.push({
            status: checked ? "Completed" : "Not Started",
            priority: "Medium",
            task: text,
        });
    }
    return tasks;
}
/** Find the most recent generated checklist markdown in the output dir. */
function findPreviousChecklist(outDir) {
    let entries;
    try {
        entries = fs.readdirSync(outDir);
    }
    catch {
        return undefined;
    }
    const md = entries
        .filter((f) => /CHECKLIST/i.test(f) && f.toLowerCase().endsWith(".md"))
        .map((f) => path.join(outDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return md[0];
}
function parseMarkdownTaskTable(mdPath) {
    const raw = fs.readFileSync(mdPath, "utf8");
    const tasks = [];
    const validStatus = [
        "Not Started",
        "In Progress",
        "Completed",
        "On Hold",
        "Cancelled",
    ];
    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim().startsWith("|"))
            continue;
        const cells = line.split("|").map((c) => c.trim());
        // Expect leading + trailing empty from split.
        const cols = cells.slice(1, -1);
        if (cols.length < 3)
            continue;
        if (/^-+$/.test(cols[0].replace(/[:\s]/g, "-")))
            continue;
        const maybeStatus = cols.find((c) => validStatus.includes(c));
        if (!maybeStatus)
            continue;
        const rest = cols.filter((c) => c !== maybeStatus);
        tasks.push({
            status: maybeStatus,
            priority: (["High", "Medium", "Low"].includes(rest[0]) ? rest[0] : "Medium"),
            task: rest[1] || rest[0] || "",
            notes: rest[2],
        });
    }
    return tasks;
}
/**
 * AI mode: we do not fabricate work. We assemble the factual context
 * (git + scanner + session) into task rows and let the operator refine later.
 * This is deterministic and offline; the "AI" framing is the interactive
 * synthesis of real signals.
 */
async function buildFromAI(cwd) {
    const { tasks } = await buildFromScan(cwd);
    try {
        const session = await (0, session_1.readSession)();
        for (const e of session) {
            if (e.type === "note" || e.type === "feature" || e.type === "bugfix") {
                tasks.push({
                    status: "In Progress",
                    priority: "Medium",
                    task: e.description,
                    notes: `Tracked at ${e.time}`,
                });
            }
        }
    }
    catch {
        /* session optional */
    }
    return tasks;
}
async function promptMode(rl) {
    process.stdout.write("\nHow would you like to build the checklist?\n" +
        "  1. Manual entry\n" +
        "  2. Scan repository (git + code analysis)\n" +
        "  3. From a spec / markdown file\n" +
        "  4. From a previous report\n" +
        "  5. AI-assisted (synthesize from tracked signals)\n");
    const choice = (await ask(rl, "Select [1-5] (default 2): ")).trim();
    switch (choice) {
        case "1":
            return "manual";
        case "3":
            return "spec";
        case "4":
            return "previous";
        case "5":
            return "ai";
        case "2":
        case "":
        default:
            return "scan";
    }
}
async function manualTasks(rl) {
    const tasks = [];
    process.stdout.write("\nEnter tasks one per line. Blank line to finish.\n" +
        "Format: <task text> [| High|Medium|Low] [| notes]\n");
    for (;;) {
        const line = (await ask(rl, `  task ${tasks.length + 1}: `)).trim();
        if (!line)
            break;
        const parts = line.split("|").map((p) => p.trim());
        const priority = (["High", "Medium", "Low"].includes(parts[1])
            ? parts[1]
            : "Medium");
        tasks.push({
            status: "Not Started",
            priority,
            task: parts[0],
            notes: parts[2] || undefined,
        });
    }
    return tasks;
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
/** Write the resolved checklist in every requested format; returns paths. */
async function exportChecklist(checklist, outDir, format, cfg, blank, noClobber = false) {
    const stem = fileStem(checklist.developer || "developer", new Date());
    const written = [];
    if (format === "pdf") {
        const out = (0, config_1.prepareOutPath)(path.join(outDir, `${stem}.pdf`), { noClobber });
        await (0, pdfExporter_1.renderChecklistPDF)(checklist, out, { blank });
        written.push(out);
        return written;
    }
    // Template-driven text formats (markdown / md / html / docx-as-html fallback).
    const tpl = (0, templateEngine_1.loadTemplate)("checklist", cfg.template);
    const data = (0, templateEngine_1.checklistToTemplateData)(checklist);
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
async function run(args) {
    const { flags, bools } = parseArgs(args);
    const cfg = (0, config_1.loadConfig)();
    const cwd = process.cwd();
    const outDir = flags.out
        ? path.resolve(cwd, flags.out)
        : (0, config_1.resolveReportDir)(cfg, "checklist");
    fs.mkdirSync(outDir, { recursive: true });
    const blank = bools.has("blank");
    const noClobber = bools.has("no-clobber");
    const format = normalizeFormat(flags.format, cfg.export);
    const date = flags.date ? new Date(flags.date) : new Date();
    const developer = flags.developer || cfg.developer || "Developer";
    const project = flags.project || path.basename(cwd);
    const sprint = flags.sprint || "Sprint";
    // ---- Blank form short-circuit ----
    if (blank) {
        const checklist = {
            project: "",
            // Used only to name the file (e.g. CASERES_CHECKLIST_…); the blank
            // renderer leaves the visible meta grid empty regardless.
            developer,
            date: "",
            sprint: "",
            subtitle: "",
            tasks: [],
            goals: [],
            deliverables: [],
        };
        const written = await exportChecklist(checklist, outDir, format, cfg, true, noClobber);
        recordCompleted("checklist", written, { blank: true });
        console.log(`Blank checklist written:\n  ${written.join("\n  ")}`);
        return;
    }
    const interactive = !flags.mode && hasTTY();
    let mode;
    let rl;
    if (interactive) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        mode = await promptMode(rl);
    }
    else {
        mode = flags.mode || "scan";
    }
    let tasks = [];
    let goals = [];
    let deliverables = [];
    try {
        switch (mode) {
            case "manual": {
                if (!rl)
                    throw new Error("Manual mode requires an interactive terminal.");
                tasks = await manualTasks(rl);
                goals = await collectList(rl, "Goals — what should be true by the end");
                deliverables = await collectList(rl, "Expected deliverables");
                break;
            }
            case "spec": {
                const specPath = flags.spec || flags.file;
                if (!specPath)
                    throw new Error("spec mode requires --spec=<path>");
                tasks = buildFromSpec(path.resolve(cwd, specPath));
                break;
            }
            case "previous": {
                const prev = flags.from || findPreviousChecklist(outDir);
                if (!prev)
                    throw new Error("No previous checklist found to build from.");
                tasks = parseMarkdownTaskTable(path.resolve(cwd, prev));
                break;
            }
            case "ai": {
                tasks = await buildFromAI(cwd);
                break;
            }
            case "scan":
            default: {
                const scanned = await buildFromScan(cwd);
                tasks = scanned.tasks;
                break;
            }
        }
    }
    finally {
        if (rl)
            rl.close();
    }
    const checklist = {
        project,
        developer,
        date: humanDate(date),
        sprint,
        subtitle: flags.subtitle || `Planned work for ${project}`,
        tasks,
        goals,
        deliverables,
    };
    const written = await exportChecklist(checklist, outDir, format, cfg, false, noClobber);
    recordCompleted("checklist", written, { project, mode });
    console.log(`Checklist generated (${tasks.length} task(s)):\n  ${written.join("\n  ")}`);
}
/**
 * Append a record of the generated report to storage/completed.json so the
 * history command can list it. Best-effort; never throws.
 */
function recordCompleted(kind, files, meta) {
    try {
        const { storageDir, ensureDirs } = require("../config");
        ensureDirs();
        const p = path.join(storageDir(), "completed.json");
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
            kind,
            files,
            date: now.toISOString().slice(0, 10),
            timestamp: now.toISOString(),
            ...meta,
        });
        fs.writeFileSync(p, JSON.stringify(list, null, 2) + "\n", "utf8");
    }
    catch {
        /* history is a convenience; ignore failures */
    }
}
