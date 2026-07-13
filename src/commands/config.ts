/**
 * /config — view and edit dev-workflow configuration.
 *
 * Usage:
 *   config                    interactive editor (TTY)
 *   config get <key>          print a single value (or all keys with no key)
 *   config set <key> <value>  set a value and save
 *
 * Editable keys: backgroundTracking, export, template, outputDir, developer,
 * autoSave.
 */
import * as os from "os";
import * as path from "path";
import * as readline from "readline";

import { DevWorkflowConfig, ExportFormat } from "../types";
import { loadConfig, saveConfig, configPath } from "../config";

const EDITABLE = [
  "backgroundTracking",
  "autoSave",
  "export",
  "template",
  "outputDir",
  "checklistDir",
  "worklogDir",
  "developer",
] as const;

/** Expand a leading ~ to the user's home directory. */
function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

type EditableKey = (typeof EDITABLE)[number];

const VALID_FORMATS: ExportFormat[] = ["pdf", "markdown", "md", "docx", "html"];

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a)));
}

function hasTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function isEditable(key: string): key is EditableKey {
  return (EDITABLE as readonly string[]).includes(key);
}

function parseBool(v: string): boolean {
  return /^(1|true|yes|y|on)$/i.test(v.trim());
}

/** Coerce a raw string into the correct typed value; throws on bad input. */
function coerce(key: EditableKey, raw: string): unknown {
  const v = raw.trim();
  switch (key) {
    case "backgroundTracking":
    case "autoSave":
      return parseBool(v);
    case "export": {
      const f = v.toLowerCase();
      if (!VALID_FORMATS.includes(f as ExportFormat)) {
        throw new Error(
          `Invalid export format "${v}". Choose one of: ${VALID_FORMATS.join(", ")}`
        );
      }
      return f;
    }
    case "template":
      return v || "default";
    case "outputDir":
    case "checklistDir":
    case "worklogDir":
      return v ? expandHome(v) : undefined;
    case "developer":
      return v || undefined;
  }
}

function display(cfg: DevWorkflowConfig): void {
  console.log(`Config file: ${configPath()}`);
  for (const key of EDITABLE) {
    const val = (cfg as unknown as Record<string, unknown>)[key];
    console.log(`  ${key.padEnd(20)} = ${val === undefined ? "(unset)" : val}`);
  }
}

async function interactiveEdit(cfg: DevWorkflowConfig): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log("Edit dev-workflow config (press Enter to keep current value).\n");

    const bg = await ask(
      rl,
      `Background tracking [${cfg.backgroundTracking ? "on" : "off"}] (on/off): `
    );
    if (bg.trim()) cfg.backgroundTracking = parseBool(bg);

    const auto = await ask(
      rl,
      `Auto-save reports [${cfg.autoSave ? "on" : "off"}] (on/off): `
    );
    if (auto.trim()) cfg.autoSave = parseBool(auto);

    const fmt = await ask(
      rl,
      `Export format [${cfg.export}] (${VALID_FORMATS.join("/")}): `
    );
    if (fmt.trim()) cfg.export = coerce("export", fmt) as ExportFormat;

    const tpl = await ask(rl, `Template [${cfg.template}]: `);
    if (tpl.trim()) cfg.template = tpl.trim();

    const out = await ask(
      rl,
      `Base output directory [${cfg.outputDir || "(default: ~/Documents)"}]: `
    );
    if (out.trim()) cfg.outputDir = expandHome(out.trim());

    const clDir = await ask(
      rl,
      `Checklist folder [${cfg.checklistDir || "(uses base output dir)"}]: `
    );
    if (clDir.trim()) cfg.checklistDir = expandHome(clDir.trim());

    const wlDir = await ask(
      rl,
      `Worklog folder [${cfg.worklogDir || "(uses base output dir)"}]: `
    );
    if (wlDir.trim()) cfg.worklogDir = expandHome(wlDir.trim());

    const dev = await ask(rl, `Developer name [${cfg.developer || "(unset)"}]: `);
    if (dev.trim()) cfg.developer = dev.trim();
  } finally {
    rl.close();
  }

  saveConfig(cfg);
  console.log("\nSaved.");
  display(cfg);
}

export async function run(args: string[]): Promise<void> {
  const cfg = loadConfig();
  const sub = args[0];

  if (sub === "get") {
    const key = args[1];
    if (!key) {
      display(cfg);
      return;
    }
    const val = (cfg as unknown as Record<string, unknown>)[key];
    console.log(val === undefined ? "" : String(val));
    return;
  }

  if (sub === "set") {
    const key = args[1];
    const value = args.slice(2).join(" ");
    if (!key) throw new Error("Usage: config set <key> <value>");
    if (!isEditable(key)) {
      throw new Error(
        `Unknown or read-only key "${key}". Editable: ${EDITABLE.join(", ")}`
      );
    }
    const coerced = coerce(key, value);
    if (coerced === undefined) {
      delete (cfg as unknown as Record<string, unknown>)[key];
    } else {
      (cfg as unknown as Record<string, unknown>)[key] = coerced;
    }
    saveConfig(cfg);
    console.log(`${key} = ${coerced === undefined ? "(unset)" : coerced}`);
    return;
  }

  if (sub === "list" || sub === "show") {
    display(cfg);
    return;
  }

  // No subcommand: interactive editor if we have a TTY, else just show.
  if (hasTTY()) {
    await interactiveEdit(cfg);
  } else {
    display(cfg);
  }
}
