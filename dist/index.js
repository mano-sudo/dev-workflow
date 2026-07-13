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
exports.main = main;
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const checklist = __importStar(require("./commands/checklist"));
const worklog = __importStar(require("./commands/worklog"));
const status = __importStar(require("./commands/status"));
const configCmd = __importStar(require("./commands/config"));
const history = __importStar(require("./commands/history"));
const install = __importStar(require("./install"));
const tracker_1 = require("./services/tracker");
const VALID_ACTIVITY_TYPES = [
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
function readVersion() {
    try {
        const pkgPath = path.join(__dirname, "..", "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return String(pkg.version || "0.0.0");
    }
    catch {
        return "0.0.0";
    }
}
function printUsage() {
    console.log(`dev-workflow v${readVersion()} — Development Checklists, Worklogs & progress reports.

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
`);
}
async function runTrack(args) {
    const type = args[0];
    const description = args.slice(1).join(" ").trim();
    if (!type || !VALID_ACTIVITY_TYPES.includes(type)) {
        throw new Error(`track requires a valid type as the first argument.\n  Valid types: ${VALID_ACTIVITY_TYPES.join(", ")}\n  Usage: dev-workflow track <type> <description>`);
    }
    if (!description) {
        throw new Error("track requires a description: track <type> <description>");
    }
    await (0, tracker_1.track)(type, description);
    console.log(`Tracked [${type}] ${description}`);
}
async function main(argv) {
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
