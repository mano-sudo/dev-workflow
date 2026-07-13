/**
 * Config loading/saving for dev-workflow.
 * Config lives at ~/.claude/dev-workflow/config.json.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DevWorkflowConfig, DEFAULT_CONFIG } from "./types";

export function configDir(): string {
  return path.join(os.homedir(), ".claude", "dev-workflow");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

/** Storage lives alongside the installed extension config. */
export function storageDir(): string {
  return path.join(configDir(), "storage");
}

export function ensureDirs(): void {
  fs.mkdirSync(storageDir(), { recursive: true });
}

/** Load config, falling back to defaults and never throwing. */
export function loadConfig(): DevWorkflowConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DevWorkflowConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: DevWorkflowConfig): void {
  ensureDirs();
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

/** The fallback output directory when nothing is configured. */
export function defaultOutputDir(): string {
  const docs = path.join(os.homedir(), "Documents");
  try {
    if (fs.statSync(docs).isDirectory()) return docs;
  } catch {
    /* no Documents folder */
  }
  return path.join(process.cwd(), "dev-workflow-reports");
}

/** Resolve the base output directory; defaults per {@link defaultOutputDir}. */
export function resolveOutputDir(cfg: DevWorkflowConfig): string {
  const dir = cfg.outputDir || defaultOutputDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Guard against clobbering an existing report. If the target exists:
 *  - with `noClobber`, returns a suffixed path (` (2)`, ` (3)`, …) so both survive;
 *  - otherwise returns the same path but warns loudly (overwrite is allowed,
 *    e.g. regenerating today's report, but is never silent).
 */
export function prepareOutPath(
  outPath: string,
  opts: { noClobber?: boolean } = {}
): string {
  if (!fs.existsSync(outPath)) return outPath;
  const dir = path.dirname(outPath);
  const ext = path.extname(outPath);
  const base = path.basename(outPath, ext);
  if (opts.noClobber) {
    let n = 2;
    let candidate = path.join(dir, `${base} (${n})${ext}`);
    while (fs.existsSync(candidate)) {
      n += 1;
      candidate = path.join(dir, `${base} (${n})${ext}`);
    }
    return candidate;
  }
  try {
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.warn(
      `⚠ Overwriting existing ${base}${ext} (${kb} KB). Pass --no-clobber to keep both.`
    );
  } catch {
    /* stat failed; proceed */
  }
  return outPath;
}

/**
 * Resolve where a specific report kind is written. Precedence:
 * per-kind override (checklistDir/worklogDir) → outputDir → default.
 */
export function resolveReportDir(
  cfg: DevWorkflowConfig,
  kind: "checklist" | "worklog"
): string {
  const perKind = kind === "checklist" ? cfg.checklistDir : cfg.worklogDir;
  const dir = perKind || cfg.outputDir || defaultOutputDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
