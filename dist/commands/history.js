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
 * /history — list previously generated reports.
 *
 * Reads storage/completed.json (records written by the checklist/worklog
 * commands) and also scans the configured output directory for report files.
 * Supports filtering: today | yesterday | last7 | --date=YYYY-MM-DD (or a
 * positional YYYY-MM-DD / keyword).
 *
 * Usage:
 *   history                 today
 *   history yesterday
 *   history last7           (aliases: "last-7-days", "week")
 *   history 2026-07-11
 *   history --date=2026-07-11
 *   history all
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
function iso(d) {
    return d.toISOString().slice(0, 10);
}
function parseFilter(args) {
    let dateFlag;
    const positionals = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith("--date="))
            dateFlag = a.slice("--date=".length);
        else if (a === "--date")
            dateFlag = args[++i];
        else if (!a.startsWith("--"))
            positionals.push(a);
    }
    const raw = (dateFlag || positionals[0] || "today").toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return { type: "date", date: raw };
    switch (raw) {
        case "yesterday":
            return { type: "yesterday" };
        case "last7":
        case "last-7":
        case "last-7-days":
        case "last7days":
        case "week":
            return { type: "last7" };
        case "all":
            return { type: "all" };
        case "today":
        default:
            return { type: "today" };
    }
}
function matches(row, filter) {
    if (filter.type === "all")
        return true;
    const now = new Date();
    if (filter.type === "today")
        return row.date === iso(now);
    if (filter.type === "yesterday") {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return row.date === iso(y);
    }
    if (filter.type === "last7") {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 6);
        return row.date >= iso(cutoff) && row.date <= iso(now);
    }
    if (filter.type === "date")
        return row.date === filter.date;
    return false;
}
function loadCompletedRecords() {
    const rows = [];
    const p = path.join((0, config_1.storageDir)(), "completed.json");
    let list = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
        if (Array.isArray(parsed))
            list = parsed;
    }
    catch {
        return rows;
    }
    for (const rec of list) {
        const files = Array.isArray(rec.files) ? rec.files : [];
        const date = rec.date ||
            (rec.timestamp ? String(rec.timestamp).slice(0, 10) : iso(new Date()));
        if (files.length === 0)
            continue;
        for (const f of files) {
            rows.push({
                date,
                kind: rec.kind || inferKind(f),
                file: f,
                project: rec.project,
                timestamp: rec.timestamp,
            });
        }
    }
    return rows;
}
function inferKind(file) {
    const b = path.basename(file).toUpperCase();
    if (b.includes("WORKLOG"))
        return "worklog";
    if (b.includes("CHECKLIST"))
        return "checklist";
    return "report";
}
/** Scan the output dir for report files not already recorded. */
function scanOutputDir(outDir, known) {
    const rows = [];
    let entries;
    try {
        entries = fs.readdirSync(outDir);
    }
    catch {
        return rows;
    }
    for (const name of entries) {
        if (!/\.(pdf|md|html)$/i.test(name))
            continue;
        const full = path.join(outDir, name);
        if (known.has(full))
            continue;
        if (!/CHECKLIST|WORKLOG/i.test(name))
            continue;
        let mtime;
        try {
            mtime = fs.statSync(full).mtime;
        }
        catch {
            continue;
        }
        rows.push({
            date: iso(mtime),
            kind: inferKind(name),
            file: full,
            timestamp: mtime.toISOString(),
        });
    }
    return rows;
}
function filterLabel(f) {
    switch (f.type) {
        case "today":
            return "Today";
        case "yesterday":
            return "Yesterday";
        case "last7":
            return "Last 7 Days";
        case "all":
            return "All time";
        case "date":
            return f.date;
    }
}
async function run(args) {
    const cfg = (0, config_1.loadConfig)();
    const filter = parseFilter(args);
    const outDir = (0, config_1.resolveOutputDir)(cfg);
    const recorded = loadCompletedRecords();
    const known = new Set(recorded.map((r) => r.file));
    const scanned = scanOutputDir(outDir, known);
    const all = [...recorded, ...scanned]
        .filter((r) => matches(r, filter))
        .sort((a, b) => (b.timestamp || b.date).localeCompare(a.timestamp || a.date));
    console.log(`\x1b[1mGenerated reports — ${filterLabel(filter)}\x1b[0m`);
    console.log(`\x1b[90mOutput dir: ${outDir}\x1b[0m\n`);
    if (all.length === 0) {
        console.log("  (no reports found for this range)");
        return;
    }
    for (const r of all) {
        const exists = fs.existsSync(r.file);
        const flag = exists ? "" : " \x1b[90m(missing)\x1b[0m";
        const proj = r.project ? ` — ${r.project}` : "";
        console.log(`  ${r.date}  [${r.kind.padEnd(9)}]${proj}\n    ${r.file}${flag}`);
    }
    console.log(`\n${all.length} report(s).`);
}
