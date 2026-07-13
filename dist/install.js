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
 * dev-workflow — installer.
 *
 * Sets up the config folder, storage, default templates, and registers the
 * slash commands into ~/.claude/commands so they are usable immediately.
 *
 * Public API: `run(argv?)`.
 */
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const config_1 = require("./config");
/** Expand a leading ~ to the user's home directory. */
function expandHome(p) {
    if (p === "~")
        return os.homedir();
    if (p.startsWith("~/") || p.startsWith("~\\")) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}
/** ANSI helpers (degrade gracefully when not a TTY). */
const useColor = process.stdout.isTTY === true;
const c = {
    green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
    red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
    dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
    bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
    cyan: (s) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
};
const CHECK = c.green("✓");
const CROSS = c.red("✗");
function parseFlags(argv) {
    const flags = { yes: false, noTracking: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        // Support `--key value` and `--key=value` for path options.
        const eq = arg.indexOf("=");
        const key = eq >= 0 ? arg.slice(0, eq) : arg;
        const inlineVal = eq >= 0 ? arg.slice(eq + 1) : undefined;
        const takeVal = () => inlineVal !== undefined ? inlineVal : argv[++i];
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
function packageRoot() {
    // Compiled file lives in dist/, so ".." lands at the package root.
    return path.join(__dirname, "..");
}
/** Directory that Claude Code reads user slash-commands from. */
function commandsInstallDir() {
    return path.join(os.homedir(), ".claude", "commands");
}
function templatesConfigDir() {
    return path.join((0, config_1.configDir)(), "templates");
}
/** Copy every .md file in `srcDir` to `destDir`, overwriting. Returns names. */
function copyMarkdown(srcDir, destDir) {
    const copied = [];
    if (!fs.existsSync(srcDir))
        return copied;
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir)) {
        if (!entry.toLowerCase().endsWith(".md"))
            continue;
        const from = path.join(srcDir, entry);
        if (!fs.statSync(from).isFile())
            continue;
        const to = path.join(destDir, entry);
        try {
            fs.copyFileSync(from, to);
            copied.push(entry);
        }
        catch (err) {
            console.warn(c.dim(`  (skipped ${entry}: ${err.message})`));
        }
    }
    return copied;
}
async function promptYesNo(question, def) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const suffix = def ? " Yes / No [Yes]: " : " Yes / No [No]: ";
    return new Promise((resolve) => {
        rl.question(question + suffix, (answer) => {
            rl.close();
            const a = answer.trim().toLowerCase();
            if (a === "")
                return resolve(def);
            resolve(a === "y" || a === "yes");
        });
    });
}
/** Free-text prompt with a default; returns the (home-expanded) answer. */
async function promptText(question, def) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(`${question} [${def}]: `, (answer) => {
            rl.close();
            const a = answer.trim();
            resolve(expandHome(a === "" ? def : a));
        });
    });
}
async function run(argv = []) {
    const flags = parseFlags(argv);
    const root = packageRoot();
    console.log(c.bold("\ndev-workflow installer\n"));
    // 1. Config + storage folders.
    (0, config_1.ensureDirs)();
    fs.mkdirSync((0, config_1.configDir)(), { recursive: true });
    fs.mkdirSync((0, config_1.storageDir)(), { recursive: true });
    console.log(`${CHECK} Config folder ready: ${c.dim((0, config_1.configDir)())}`);
    console.log(`${CHECK} Storage folder ready: ${c.dim((0, config_1.storageDir)())}`);
    // 2. Copy default templates into the config folder.
    const templateSrc = path.join(root, "templates");
    const templateDest = templatesConfigDir();
    const copiedTemplates = copyMarkdown(templateSrc, templateDest);
    if (copiedTemplates.length > 0) {
        console.log(`${CHECK} Templates installed (${copiedTemplates.length}): ${c.dim(copiedTemplates.join(", "))}`);
    }
    else {
        console.log(c.dim(`  No templates found in ${templateSrc} (nothing to copy).`));
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
                    .replace(/node ~\/\.claude\/dev-workflow\/\.\.\/bin\/cli\.js/g, `node "${cliJs}"`);
                fs.writeFileSync(dest, patched, "utf8");
            }
            catch {
                /* best-effort; leave the file as copied */
            }
        }
        console.log(`${CHECK} Slash commands registered in ${c.dim(commandDest)}:`);
        for (const cmd of registered) {
            const name = cmd.replace(/\.md$/i, "");
            console.log(`    ${CHECK} /${name}`);
        }
    }
    else {
        console.log(c.dim(`  No command files found in ${commandSrc}.`));
    }
    // 4. Background tracking decision.
    let backgroundTracking = true;
    if (flags.noTracking) {
        backgroundTracking = false;
        console.log(c.dim("  Background tracking disabled via --no-tracking."));
    }
    else if (flags.yes || !process.stdin.isTTY) {
        backgroundTracking = true;
        console.log(c.dim("  Background tracking enabled (non-interactive default)."));
    }
    else {
        backgroundTracking = await promptYesNo("Enable Background Tracking? (Recommended)", true);
    }
    // 4b. Where should generated reports be saved?
    const def = (0, config_1.defaultOutputDir)();
    let outputDir;
    let checklistDir;
    let worklogDir;
    if (flags.outputDir || flags.checklistDir || flags.worklogDir) {
        // Non-interactive: honor whatever paths were passed.
        outputDir = flags.outputDir ? expandHome(flags.outputDir) : def;
        checklistDir = flags.checklistDir ? expandHome(flags.checklistDir) : undefined;
        worklogDir = flags.worklogDir ? expandHome(flags.worklogDir) : undefined;
    }
    else if (flags.yes || !process.stdin.isTTY) {
        outputDir = def;
        console.log(c.dim(`  Reports will be saved to ${def} (default).`));
    }
    else {
        outputDir = await promptText("Where should reports be saved?", def);
        const separate = await promptYesNo("Use separate folders for checklists and worklogs?", false);
        if (separate) {
            checklistDir = await promptText("  Checklist folder", path.join(outputDir, "checklist"));
            worklogDir = await promptText("  Worklog folder", path.join(outputDir, "worklog"));
        }
    }
    // Create whatever directories were chosen so the first report never fails.
    for (const dir of [outputDir, checklistDir, worklogDir]) {
        if (dir) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            }
            catch {
                /* best-effort */
            }
        }
    }
    console.log(`${CHECK} Report output: ${c.dim(checklistDir || worklogDir ? `${outputDir} (checklist: ${checklistDir || outputDir}, worklog: ${worklogDir || outputDir})` : outputDir || def)}`);
    // 5. Write config.
    const cfg = {
        backgroundTracking,
        autoSave: true,
        template: "default",
        export: "pdf",
        ...(outputDir ? { outputDir } : {}),
        ...(checklistDir ? { checklistDir } : {}),
        ...(worklogDir ? { worklogDir } : {}),
    };
    (0, config_1.saveConfig)(cfg);
    console.log(`${CHECK} Wrote config: ${c.dim((0, config_1.configPath)())}`);
    // 6. Seed storage files if absent.
    seedJsonIfAbsent(path.join((0, config_1.storageDir)(), "session.json"), []);
    seedJsonIfAbsent(path.join((0, config_1.storageDir)(), "completed.json"), []);
    console.log(`${CHECK} Storage seeded (session.json, completed.json)`);
    // 7. Verify installation.
    const problems = verify(cfg, registered);
    console.log("");
    if (problems.length === 0) {
        console.log(c.green(c.bold("Installation verified successfully.")));
        console.log("");
        console.log(c.bold("Summary"));
        console.log(`  ${CHECK} Config:    ${(0, config_1.configPath)()}`);
        console.log(`  ${CHECK} Storage:   ${(0, config_1.storageDir)()}`);
        console.log(`  ${CHECK} Templates: ${templateDest}`);
        console.log(`  ${CHECK} Commands:  ${commandDest}`);
        console.log(`  ${CHECK} Background tracking: ${backgroundTracking ? "ON" : "OFF"}`);
        console.log("");
        console.log(c.bold("Next steps"));
        console.log(`  Try ${c.cyan("/checklist")} in Claude Code to create your first Development Checklist.`);
        console.log(`  Also available: ${c.cyan("/worklog")}, ${c.cyan("/status")}, ${c.cyan("/history")}, ${c.cyan("/config")}.`);
        console.log("");
    }
    else {
        console.error(c.red(c.bold("Installation verification FAILED:")));
        for (const p of problems) {
            console.error(`  ${CROSS} ${p}`);
        }
        console.error("");
        process.exitCode = 1;
    }
}
function seedJsonIfAbsent(file, value) {
    if (fs.existsSync(file))
        return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
/** Returns a list of human-readable problems; empty means success. */
function verify(expected, commands) {
    const problems = [];
    // config.json exists & parses & matches.
    try {
        const raw = fs.readFileSync((0, config_1.configPath)(), "utf8");
        const parsed = JSON.parse(raw);
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
    }
    catch (err) {
        problems.push(`config.json unreadable/invalid: ${err.message}`);
    }
    // storage seeds exist.
    for (const name of ["session.json", "completed.json"]) {
        const f = path.join((0, config_1.storageDir)(), name);
        if (!fs.existsSync(f)) {
            problems.push(`storage/${name} missing`);
        }
        else {
            try {
                JSON.parse(fs.readFileSync(f, "utf8"));
            }
            catch {
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
