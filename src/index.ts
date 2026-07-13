/**
 * dev-workflow — CLI entry point and command dispatcher.
 *
 * Hand-rolled argument dispatch (no external arg parser). Subcommands:
 *   install    install the extension into Claude Code
 *   checklist  generate a Development Checklist
 *   worklog    generate a Development Worklog
 *   status     print today's progress
 *   config     view/edit configuration
 *   history    list previously generated reports
 *   track      manually record an activity: track <type> <description>
 *   help       usage
 *   version    print version
 */
import * as fs from "fs";
import * as path from "path";

import * as checklist from "./commands/checklist";
import * as worklog from "./commands/worklog";
import * as status from "./commands/status";
import * as configCmd from "./commands/config";
import * as history from "./commands/history";
import * as install from "./install";
import { track } from "./services/tracker";
import { ActivityType } from "./types";

const VALID_ACTIVITY_TYPES: ActivityType[] = [
  "feature",
  "bugfix",
  "refactor",
  "test",
  "build",
  "commit",
  "command",
  "package",
  "migration",
  "file-created",
  "file-edited",
  "file-deleted",
  "note",
];

function readVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function printUsage(): void {
  console.log(
    `dev-workflow v${readVersion()} — Development Checklists, Worklogs & progress reports.

Usage: dev-workflow <command> [options]

Commands:
  checklist [--mode=manual|scan|spec|previous|ai] [--blank] [--no-clobber]
            [--project P] [--developer D] [--date YYYY-MM-DD] [--sprint S]
            [--spec FILE] [--from FILE] [--out DIR] [--format pdf|md|html]
                       Generate a Development Checklist.
  worklog   [--blank] [--no-clobber] [--project P] [--developer D] [--date YYYY-MM-DD]
            [--sprint S] [--out DIR] [--format pdf|md|html]
                       Generate a Development Worklog for today.
  status                Show today's progress (completed / in-progress / pending).
  config    [get <key> | set <key> <value>]
                       View or edit configuration (interactive with no args).
  history   [today | yesterday | last7 | YYYY-MM-DD | all] [--date=YYYY-MM-DD]
                       List previously generated reports.
  track <type> <description>
                       Manually record an activity.
                       type: ${VALID_ACTIVITY_TYPES.join(", ")}
  install               Install the extension into Claude Code.
  version               Print the version.
  help                  Show this help.
`
  );
}

async function runTrack(args: string[]): Promise<void> {
  const type = args[0] as ActivityType | undefined;
  const description = args.slice(1).join(" ").trim();
  if (!type || !VALID_ACTIVITY_TYPES.includes(type)) {
    throw new Error(
      `track requires a valid type as the first argument.\n  Valid types: ${VALID_ACTIVITY_TYPES.join(
        ", "
      )}\n  Usage: dev-workflow track <type> <description>`
    );
  }
  if (!description) {
    throw new Error("track requires a description: track <type> <description>");
  }
  await track(type, description);
  console.log(`Tracked [${type}] ${description}`);
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "install":
      await install.run(rest);
      return;
    case "checklist":
      await checklist.run(rest);
      return;
    case "worklog":
      await worklog.run(rest);
      return;
    case "status":
      await status.run(rest);
      return;
    case "config":
      await configCmd.run(rest);
      return;
    case "history":
      await history.run(rest);
      return;
    case "track":
      await runTrack(rest);
      return;
    case "version":
    case "--version":
    case "-v":
      console.log(readVersion());
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      printUsage();
      process.exitCode = 1;
      return;
  }
}
