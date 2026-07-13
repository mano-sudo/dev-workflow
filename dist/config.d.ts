import { DevWorkflowConfig } from "./types";
export declare function configDir(): string;
export declare function configPath(): string;
/** Storage lives alongside the installed extension config. */
export declare function storageDir(): string;
export declare function ensureDirs(): void;
/** Load config, falling back to defaults and never throwing. */
export declare function loadConfig(): DevWorkflowConfig;
export declare function saveConfig(cfg: DevWorkflowConfig): void;
/** The fallback output directory when nothing is configured. */
export declare function defaultOutputDir(): string;
/** Resolve the base output directory; defaults per {@link defaultOutputDir}. */
export declare function resolveOutputDir(cfg: DevWorkflowConfig): string;
/**
 * Guard against clobbering an existing report. If the target exists:
 *  - with `noClobber`, returns a suffixed path (` (2)`, ` (3)`, …) so both survive;
 *  - otherwise returns the same path but warns loudly (overwrite is allowed,
 *    e.g. regenerating today's report, but is never silent).
 */
export declare function prepareOutPath(outPath: string, opts?: {
    noClobber?: boolean;
}): string;
/**
 * Resolve where a specific report kind is written. Precedence:
 * per-kind override (checklistDir/worklogDir) → outputDir → default.
 */
export declare function resolveReportDir(cfg: DevWorkflowConfig, kind: "checklist" | "worklog"): string;
