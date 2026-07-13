/**
 * /worklog — generate a Development Worklog for the day.
 *
 * The worklog auto-generates from what was actually completed today (tracked
 * session activity + git commits). In a terminal the developer can review and
 * add to that baseline (extra accomplishments, blockers, next priorities,
 * hours, status); pass --auto to accept the generated worklog as-is.
 * Exports as PDF / Markdown / HTML per config + flags.
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

import {
  ActivityEntry,
  DevWorkflowConfig,
  ExportFormat,
  ScheduleStatus,
  TimeAllocation,
  Worklog,
  WorklogChecklistItem,
} from "../types";
import {
  loadConfig,
  resolveReportDir,
  prepareOutPath,
  storageDir,
  ensureDirs,
} from "../config";
import { renderWorklogPDF } from "../services/pdfExporter";
import {
  loadTemplate,
  render,
  worklogToTemplateData,
  toHTML,
} from "../services/templateEngine";
import { getGitContext } from "../services/git";
import { todaysActivities } from "../services/session";

interface ParsedArgs {
  flags: Record<string, string>;
  bools: Set<string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[body] = next;
        i++;
      } else {
        bools.add(body);
      }
    }
  }
  return { flags, bools };
}

function hasTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a)));
}

function humanDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeFormat(v: string | undefined, fallback: ExportFormat): ExportFormat {
  const f = (v || "").toLowerCase();
  if (f === "pdf" || f === "markdown" || f === "md" || f === "docx" || f === "html") {
    return f as ExportFormat;
  }
  return fallback;
}

function slug(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase() || "PROJECT"
  );
}

function fileStem(developer: string, date: Date): string {
  const last = developer.trim().split(/\s+/).pop() || developer;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${slug(last)}_WORKLOG_${mm}-${dd}-${yyyy}`;
}

/** Rough time buckets derived from activity types (hours). */
function timeFromActivities(entries: ActivityEntry[]): TimeAllocation {
  // Estimate ~0.5h per tracked activity, bucketed by type.
  const t: Required<TimeAllocation> = {
    planning: 0,
    development: 0,
    testing: 0,
    bugFixes: 0,
    meetings: 0,
    total: 0,
  };
  for (const e of entries) {
    const unit = 0.5;
    switch (e.type) {
      case "test":
        t.testing += unit;
        break;
      case "bugfix":
        t.bugFixes += unit;
        break;
      case "note":
        t.planning += unit;
        break;
      case "feature":
      case "refactor":
      case "build":
      case "commit":
      case "command":
      case "package":
      case "migration":
      case "file-created":
      case "file-edited":
      case "file-deleted":
      default:
        t.development += unit;
        break;
    }
  }
  t.total =
    t.planning + t.development + t.testing + t.bugFixes + t.meetings;
  return t;
}

/** Build worklog content from the tracked session + git context. */
async function buildFromSession(cwd: string): Promise<Partial<Worklog>> {
  const entries = await todaysActivities();

  const checklistItems: WorklogChecklistItem[] = [];
  const additional: string[] = [];

  for (const e of entries) {
    if (e.type === "feature" || e.type === "bugfix" || e.type === "refactor") {
      checklistItems.push({
        task: e.description,
        status: "Completed",
        result: `${e.type} at ${e.time}`,
      });
    } else {
      additional.push(`${e.time} — ${e.description}`);
    }
  }

  let summary = "";
  const next: string[] = [];
  try {
    const git = await getGitContext(cwd);
    if (git.recentCommits && git.recentCommits.length) {
      for (const c of git.recentCommits.slice(0, 10)) {
        additional.push(`Commit ${c.hash.slice(0, 7)}: ${c.subject}`);
      }
    }
    if (git.changedFiles && git.changedFiles.length) {
      next.push(
        `Finish/commit ${git.changedFiles.length} pending change(s) in progress`
      );
    }
    if (git.branch) summary = `Work on branch ${git.branch}.`;
  } catch {
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

async function collectList(
  rl: readline.Interface,
  label: string
): Promise<string[]> {
  const out: string[] = [];
  process.stdout.write(`\n${label} (one per line, blank to finish):\n`);
  for (;;) {
    const line = (await ask(rl, "  - ")).trim();
    if (!line) break;
    out.push(line);
  }
  return out;
}

/** Type completed tasks one at a time (task text + optional result). */
async function collectChecklistItems(
  rl: readline.Interface,
  label: string
): Promise<WorklogChecklistItem[]> {
  const out: WorklogChecklistItem[] = [];
  process.stdout.write(`\n${label} — type one at a time, blank to finish.\n`);
  for (;;) {
    const task = (await ask(rl, `\n  Completed task ${out.length + 1}: `)).trim();
    if (!task) break;
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
async function enrichWorklogInteractive(
  rl: readline.Interface,
  auto: Partial<Worklog>
): Promise<Partial<Worklog>> {
  const autoCompleted = auto.checklistItems ?? [];
  process.stdout.write(
    `\nAuto-detected ${autoCompleted.length} completed task(s) from your tracked activity + git:\n`
  );
  if (autoCompleted.length === 0) {
    process.stdout.write("  (nothing tracked yet — add them below)\n");
  } else {
    autoCompleted.forEach((c, i) =>
      process.stdout.write(`  ${i + 1}. ${c.task}${c.result ? ` — ${c.result}` : ""}\n`)
    );
  }

  const extraCompleted = await collectChecklistItems(
    rl,
    "Add any completed tasks that weren't tracked"
  );
  const checklistItems = [...autoCompleted, ...extraCompleted];

  const additional = [
    ...(auto.additional ?? []),
    ...(await collectList(rl, "Additional work done (beyond the plan)")),
  ];
  const notCompleted = await collectList(rl, "Tasks NOT completed");
  const blockers = await collectList(rl, "Blockers");
  const next = [
    ...(auto.next ?? []),
    ...(await collectList(rl, "Next priorities")),
  ];
  const notes = await collectList(rl, "Notes");

  const autoHours = auto.time?.total;
  const hoursRaw = (
    await ask(rl, `\nTotal hours worked [${autoHours ? String(autoHours) : "e.g. 6.5"}]: `)
  ).trim();
  const total = hoursRaw ? Number(hoursRaw) : autoHours;
  const time: TimeAllocation =
    total && Number.isFinite(total) ? { ...auto.time, total } : auto.time ?? {};

  const statusRaw = (await ask(
    rl,
    "Overall status [1=On Schedule, 2=Slight Delay, 3=Delayed] (default 1): "
  )).trim();
  const status: ScheduleStatus =
    statusRaw === "2" ? "Slight Delay" : statusRaw === "3" ? "Delayed" : "On Schedule";

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

async function exportWorklog(
  worklog: Worklog,
  outDir: string,
  format: ExportFormat,
  cfg: DevWorkflowConfig,
  blank: boolean,
  noClobber = false
): Promise<string[]> {
  const stem = fileStem(worklog.developer || "developer", new Date());
  const written: string[] = [];

  if (format === "pdf") {
    const out = prepareOutPath(path.join(outDir, `${stem}.pdf`), { noClobber });
    await renderWorklogPDF(worklog, out, { blank });
    written.push(out);
    return written;
  }

  const tpl = loadTemplate("worklog", cfg.template);
  const data = worklogToTemplateData(worklog);
  const md = render(tpl, data);

  if (format === "markdown" || format === "md" || format === "docx") {
    const ext = format === "docx" ? "doc.md" : "md";
    const out = prepareOutPath(path.join(outDir, `${stem}.${ext}`), { noClobber });
    fs.writeFileSync(out, md, "utf8");
    written.push(out);
  }
  if (format === "html") {
    const out = prepareOutPath(path.join(outDir, `${stem}.html`), { noClobber });
    fs.writeFileSync(out, toHTML(md), "utf8");
    written.push(out);
  }
  return written;
}

function recordCompleted(files: string[], meta: Record<string, unknown>): void {
  try {
    ensureDirs();
    const p = path.join(storageDir(), "completed.json");
    let list: unknown[] = [];
    try {
      list = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!Array.isArray(list)) list = [];
    } catch {
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
  } catch {
    /* ignore */
  }
}

export async function run(args: string[]): Promise<void> {
  const { flags, bools } = parseArgs(args);
  const cfg = loadConfig();
  const cwd = process.cwd();
  const outDir = flags.out
    ? path.resolve(cwd, flags.out)
    : resolveReportDir(cfg, "worklog");
  fs.mkdirSync(outDir, { recursive: true });
  const blank = bools.has("blank");
  const noClobber = bools.has("no-clobber");
  const format = normalizeFormat(flags.format, cfg.export);

  const date = flags.date ? new Date(flags.date) : new Date();
  const developer = flags.developer || cfg.developer || "Developer";
  const project = flags.project || path.basename(cwd);
  const sprint = flags.sprint || "Sprint";

  const base: Worklog = {
    project,
    developer,
    date: humanDate(date),
    sprint,
    subtitle: flags.subtitle || `Daily worklog for ${project}`,
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
    const empty: Worklog = {
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

  // Always auto-generate from what was actually completed today (tracked
  // activity + git commits). This is the baseline the worklog is built on.
  let content = await buildFromSession(cwd);

  // In a terminal, let the developer review and add to the auto-detected work,
  // unless --auto / --yes was passed to accept the generated worklog as-is.
  const autoOnly = bools.has("auto") || bools.has("yes");
  if (!autoOnly && hasTTY()) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      content = await enrichWorklogInteractive(rl, content);
    } finally {
      rl.close();
    }
  }

  const worklog: Worklog = { ...base, ...content };
  const written = await exportWorklog(worklog, outDir, format, cfg, false, noClobber);
  recordCompleted(written, { project });
  console.log(
    `Worklog generated (${worklog.checklistItems.length} completed item(s)):\n  ${written.join(
      "\n  "
    )}`
  );
}
