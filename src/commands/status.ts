/**
 * /status — print today's progress at a glance.
 *
 * Combines the tracked session (today's activities) with git context to show
 * Completed / In Progress / Pending work, an estimated completion, and hours.
 * Console output only; never writes files.
 */
import { ActivityEntry } from "../types";
import { loadConfig } from "../config";
import { todaysActivities } from "../services/session";
import { getGitContext } from "../services/git";

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
    if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
    else bools.add(body);
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

function heading(s: string): string {
  return `\n\x1b[1m${s}\x1b[0m`;
}

function bullet(s: string): string {
  return `  • ${s}`;
}

/** Estimate hours from activity count (~0.5h per activity, capped). */
function estimateHours(entries: ActivityEntry[]): number {
  const raw = entries.length * 0.5;
  return Math.round(raw * 10) / 10;
}

export async function run(args: string[]): Promise<void> {
  parseArgs(args);
  const cfg = loadConfig();
  const cwd = process.cwd();

  let entries: ActivityEntry[] = [];
  try {
    entries = await todaysActivities();
  } catch {
    entries = [];
  }

  const completed: string[] = [];
  const inProgress: string[] = [];
  const notes: string[] = [];

  for (const e of entries) {
    const line = `${e.time}  ${e.description}`;
    if (DONE_TYPES.has(e.type)) completed.push(line);
    else if (PROGRESS_TYPES.has(e.type)) inProgress.push(line);
    else notes.push(line);
  }

  const pending: string[] = [];
  let branch: string | undefined;
  try {
    const git = await getGitContext(cwd);
    branch = git.branch;
    if (git.changedFiles) {
      for (const f of git.changedFiles) pending.push(`Uncommitted: ${f}`);
    }
  } catch {
    /* git optional */
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalItems = completed.length + inProgress.length + pending.length;
  const pct =
    totalItems === 0
      ? 0
      : Math.round((completed.length / totalItems) * 100);

  console.log(`\x1b[1mTODAY'S PROGRESS\x1b[0m — ${today}`);
  if (branch) console.log(`\x1b[90mBranch: ${branch}\x1b[0m`);
  if (!cfg.backgroundTracking) {
    console.log(
      "\x1b[90m(background tracking is OFF — session data may be sparse)\x1b[0m"
    );
  }

  console.log(heading(`COMPLETED (${completed.length})`));
  if (completed.length) completed.forEach((l) => console.log(bullet(l)));
  else console.log("  (nothing tracked as completed yet)");

  console.log(heading(`IN PROGRESS (${inProgress.length})`));
  if (inProgress.length) inProgress.forEach((l) => console.log(bullet(l)));
  else console.log("  (nothing in progress)");

  console.log(heading(`PENDING (${pending.length})`));
  if (pending.length) pending.forEach((l) => console.log(bullet(l)));
  else console.log("  (no pending git changes)");

  if (notes.length) {
    console.log(heading(`NOTES (${notes.length})`));
    notes.forEach((l) => console.log(bullet(l)));
  }

  console.log(heading("SUMMARY"));
  console.log(`  Progress:             ${pct}% (${completed.length}/${totalItems || 0})`);
  const est =
    pct >= 100
      ? "Complete"
      : pending.length + inProgress.length === 0
      ? "No open work"
      : `${pending.length + inProgress.length} item(s) remaining`;
  console.log(`  Estimated completion: ${est}`);
  console.log(`  Hours worked:         ~${estimateHours(entries)} h`);
  console.log("");
}
