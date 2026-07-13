/**
 * dev-workflow — installer.
 *
 * Sets up the config folder, storage, default templates, and registers the
 * slash commands into ~/.claude/commands so they are usable immediately.
 *
 * Public API: `run(argv?)`.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";

import { DevWorkflowConfig } from "./types";
import {
  configDir,
  configPath,
  storageDir,
  ensureDirs,
  saveConfig,
  loadConfig,
  defaultOutputDir,
} from "./config";

/** Expand a leading ~ to the user's home directory. */
function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** ANSI helpers (degrade gracefully when not a TTY). */
const useColor = process.stdout.isTTY === true;
const c = {
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
};

const CHECK = c.green("✓");
const CROSS = c.red("✗");

interface Flags {
  yes: boolean;
  noTracking: boolean;
  outputDir?: string;
  checklistDir?: string;
  worklogDir?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { yes: false, noTracking: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Support `--key value` and `--key=value` for path options.
    const eq = arg.indexOf("=");
    const key = eq >= 0 ? arg.slice(0, eq) : arg;
    const inlineVal = eq >= 0 ? arg.slice(eq + 1) : undefined;
    const takeVal = (): string | undefined =>
      inlineVal !== undefined ? inlineVal : argv[++i];
    switch (key) {
      case "--yes":
      case "-y":
      case "--non-interactive":
        flags.yes = true;
        break;
      case "--no-tracking":
        flags.noTracking = true;
        break;
      case "--output-dir":
      case "--out":
        flags.outputDir = takeVal();
        break;
      case "--checklist-dir":
        flags.checklistDir = takeVal();
        break;
      case "--worklog-dir":
        flags.worklogDir = takeVal();
        break;
      default:
        // Ignore unknown args so the installer stays forgiving in CI.
        break;
    }
  }
  return flags;
}

/** Resolve the packaged root (where templates/ and commands/ live). */
function packageRoot(): string {
  // Compiled file lives in dist/, so ".." lands at the package root.
  return path.join(__dirname, "..");
}

/** Directory that Claude Code reads user slash-commands from. */
function commandsInstallDir(): string {
  return path.join(os.homedir(), ".claude", "commands");
}

function templatesConfigDir(): string {
  return path.join(configDir(), "templates");
}

/** Copy every .md file in `srcDir` to `destDir`, overwriting. Returns names. */
function copyMarkdown(srcDir: string, destDir: string): string[] {
  const copied: string[] = [];
  if (!fs.existsSync(srcDir)) return copied;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    if (!entry.toLowerCase().endsWith(".md")) continue;
    const from = path.join(srcDir, entry);
    if (!fs.statSync(from).isFile()) continue;
    const to = path.join(destDir, entry);
    try {
      fs.copyFileSync(from, to);
      copied.push(entry);
    } catch (err) {
      console.warn(
        c.dim(`  (skipped ${entry}: ${(err as Error).message})`)
      );
    }
  }
  return copied;
}

async function promptYesNo(question: string, def: boolean): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const suffix = def ? " Yes / No [Yes]: " : " Yes / No [No]: ";
  return new Promise<boolean>((resolve) => {
    rl.question(question + suffix, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "") return resolve(def);
      resolve(a === "y" || a === "yes");
    });
  });
}

/** Free-text prompt with a default; returns the (home-expanded) answer. */
async function promptText(question: string, def: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise<string>((resolve) => {
    rl.question(`${question} [${def}]: `, (answer) => {
      rl.close();
      const a = answer.trim();
      resolve(expandHome(a === "" ? def : a));
    });
  });
}

export async function run(argv: string[] = []): Promise<void> {
  const flags = parseFlags(argv);
  const root = packageRoot();

  // Existing config (if re-installing) provides the defaults, so a re-run never
  // clobbers paths/settings the user already chose.
  const existing = fs.existsSync(configPath()) ? loadConfig() : undefined;

  console.log(c.bold("\ndev-workflow installer\n"));

  // 1. Config + storage folders.
  ensureDirs();
  fs.mkdirSync(configDir(), { recursive: true });
  fs.mkdirSync(storageDir(), { recursive: true });
  console.log(`${CHECK} Config folder ready: ${c.dim(configDir())}`);
  console.log(`${CHECK} Storage folder ready: ${c.dim(storageDir())}`);

  // 2. Copy default templates into the config folder.
  const templateSrc = path.join(root, "templates");
  const templateDest = templatesConfigDir();
  const copiedTemplates = copyMarkdown(templateSrc, templateDest);
  if (copiedTemplates.length > 0) {
    console.log(
      `${CHECK} Templates installed (${copiedTemplates.length}): ${c.dim(
        copiedTemplates.join(", ")
      )}`
    );
  } else {
    console.log(
      c.dim(`  No templates found in ${templateSrc} (nothing to copy).`)
    );
  }

  // 3. Register slash commands into ~/.claude/commands.
  const commandSrc = path.join(root, "commands");
  const commandDest = commandsInstallDir();
  const registered = copyMarkdown(commandSrc, commandDest);
  if (registered.length > 0) {
    // Point every registered command at the CLI's real absolute path so the
    // slash commands work immediately after install without needing the
    // package published to npm or present on PATH.
    const cliJs = path.join(root, "bin", "cli.js");
    for (const cmd of registered) {
      const dest = path.join(commandDest, cmd);
      try {
        const patched = fs
          .readFileSync(dest, "utf8")
          .replace(/npx dev-workflow/g, `node "${cliJs}"`)
          .replace(
            /node ~\/\.claude\/dev-workflow\/\.\.\/bin\/cli\.js/g,
            `node "${cliJs}"`
          );
        fs.writeFileSync(dest, patched, "utf8");
      } catch {
        /* best-effort; leave the file as copied */
      }
    }
    console.log(`${CHECK} Slash commands registered in ${c.dim(commandDest)}:`);
    for (const cmd of registered) {
      const name = cmd.replace(/\.md$/i, "");
      console.log(`    ${CHECK} /${name}`);
    }
  } else {
    console.log(
      c.dim(`  No command files found in ${commandSrc}.`)
    );
  }

  // 4. Background tracking decision (defaults to the existing setting on re-run).
  const trackingDefault = existing?.backgroundTracking ?? true;
  let backgroundTracking = trackingDefault;
  if (flags.noTracking) {
    backgroundTracking = false;
    console.log(c.dim("  Background tracking disabled via --no-tracking."));
  } else if (flags.yes || !process.stdin.isTTY) {
    backgroundTracking = trackingDefault;
    console.log(
      c.dim(`  Background tracking ${backgroundTracking ? "enabled" : "disabled"} (non-interactive).`)
    );
  } else {
    backgroundTracking = await promptYesNo(
      "Enable Background Tracking? (Recommended)",
      trackingDefault
    );
  }

  // 4b. Where should each report type be saved? Ask for the checklist folder
  //     and the worklog folder directly so they are always set explicitly.
  const base = flags.outputDir
    ? expandHome(flags.outputDir)
    : existing?.outputDir || defaultOutputDir();
  const defChecklist =
    (flags.checklistDir && expandHome(flags.checklistDir)) ||
    existing?.checklistDir ||
    path.join(base, "checklist");
  const defWorklog =
    (flags.worklogDir && expandHome(flags.worklogDir)) ||
    existing?.worklogDir ||
    path.join(base, "accomplishment");

  let checklistDir: string;
  let worklogDir: string;

  if (flags.yes || !process.stdin.isTTY) {
    // Non-interactive: flags win, else existing config, else sensible defaults.
    checklistDir = defChecklist;
    worklogDir = defWorklog;
    console.log(
      c.dim(`  Checklists → ${checklistDir}\n  Worklogs   → ${worklogDir}`)
    );
  } else {
    console.log("\nWhere should your reports be saved?");
    checklistDir = await promptText(
      "  Folder for Development Checklists",
      defChecklist
    );
    worklogDir = await promptText("  Folder for Development Worklogs", defWorklog);
  }
  const outputDir = base;

  // Create the chosen directories so the first report never fails to write.
  for (const dir of [outputDir, checklistDir, worklogDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* best-effort */
    }
  }
  console.log(
    `${CHECK} Report output:\n    ${c.dim(`checklists → ${checklistDir}`)}\n    ${c.dim(`worklogs   → ${worklogDir}`)}`
  );

  // 5. Write config.
  const cfg: DevWorkflowConfig = {
    backgroundTracking,
    autoSave: true,
    template: "default",
    export: "pdf",
    outputDir,
    checklistDir,
    worklogDir,
  };
  saveConfig(cfg);
  console.log(`${CHECK} Wrote config: ${c.dim(configPath())}`);

  // 6. Seed storage files if absent.
  seedJsonIfAbsent(path.join(storageDir(), "session.json"), []);
  seedJsonIfAbsent(path.join(storageDir(), "completed.json"), []);
  console.log(`${CHECK} Storage seeded (session.json, completed.json)`);

  // 7. Verify installation.
  const problems = verify(cfg, registered);
  console.log("");
  if (problems.length === 0) {
    console.log(c.green(c.bold("Installation verified successfully.")));
    console.log("");
    console.log(c.bold("Summary"));
    console.log(`  ${CHECK} Config:    ${configPath()}`);
    console.log(`  ${CHECK} Storage:   ${storageDir()}`);
    console.log(`  ${CHECK} Templates: ${templateDest}`);
    console.log(`  ${CHECK} Commands:  ${commandDest}`);
    console.log(
      `  ${CHECK} Background tracking: ${backgroundTracking ? "ON" : "OFF"}`
    );
    console.log("");
    console.log(c.bold("Next steps"));
    console.log(
      `  Try ${c.cyan("/checklist")} in Claude Code to create your first Development Checklist.`
    );
    console.log(
      `  Also available: ${c.cyan("/worklog")}, ${c.cyan("/status")}, ${c.cyan(
        "/history"
      )}, ${c.cyan("/config")}.`
    );
    console.log("");
  } else {
    console.error(c.red(c.bold("Installation verification FAILED:")));
    for (const p of problems) {
      console.error(`  ${CROSS} ${p}`);
    }
    console.error("");
    process.exitCode = 1;
  }
}

function seedJsonIfAbsent(file: string, value: unknown): void {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/** Returns a list of human-readable problems; empty means success. */
function verify(expected: DevWorkflowConfig, commands: string[]): string[] {
  const problems: string[] = [];

  // config.json exists & parses & matches.
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DevWorkflowConfig>;
    if (typeof parsed.backgroundTracking !== "boolean") {
      problems.push("config.json missing backgroundTracking");
    }
    if (parsed.autoSave !== expected.autoSave) {
      problems.push("config.json autoSave mismatch");
    }
    if (parsed.template !== expected.template) {
      problems.push("config.json template mismatch");
    }
    if (parsed.export !== expected.export) {
      problems.push("config.json export mismatch");
    }
  } catch (err) {
    problems.push(`config.json unreadable/invalid: ${(err as Error).message}`);
  }

  // storage seeds exist.
  for (const name of ["session.json", "completed.json"]) {
    const f = path.join(storageDir(), name);
    if (!fs.existsSync(f)) {
      problems.push(`storage/${name} missing`);
    } else {
      try {
        JSON.parse(fs.readFileSync(f, "utf8"));
      } catch {
        problems.push(`storage/${name} is not valid JSON`);
      }
    }
  }

  // each registered command present in the install dir.
  const dest = commandsInstallDir();
  for (const cmd of commands) {
    if (!fs.existsSync(path.join(dest, cmd))) {
      problems.push(`command ${cmd} not present in ${dest}`);
    }
  }

  return problems;
}
