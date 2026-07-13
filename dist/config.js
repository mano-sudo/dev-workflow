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
exports.configDir = configDir;
exports.configPath = configPath;
exports.storageDir = storageDir;
exports.ensureDirs = ensureDirs;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.defaultOutputDir = defaultOutputDir;
exports.resolveOutputDir = resolveOutputDir;
exports.prepareOutPath = prepareOutPath;
exports.resolveReportDir = resolveReportDir;
/**
 * Config loading/saving for dev-workflow.
 * Config lives at ~/.claude/dev-workflow/config.json.
 */
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const types_1 = require("./types");
function configDir() {
    return path.join(os.homedir(), ".claude", "dev-workflow");
}
function configPath() {
    return path.join(configDir(), "config.json");
}
/** Storage lives alongside the installed extension config. */
function storageDir() {
    return path.join(configDir(), "storage");
}
function ensureDirs() {
    fs.mkdirSync(storageDir(), { recursive: true });
}
/** Load config, falling back to defaults and never throwing. */
function loadConfig() {
    try {
        const raw = fs.readFileSync(configPath(), "utf8");
        const parsed = JSON.parse(raw);
        return { ...types_1.DEFAULT_CONFIG, ...parsed };
    }
    catch {
        return { ...types_1.DEFAULT_CONFIG };
    }
}
function saveConfig(cfg) {
    ensureDirs();
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
/** The fallback output directory when nothing is configured. */
function defaultOutputDir() {
    const docs = path.join(os.homedir(), "Documents");
    try {
        if (fs.statSync(docs).isDirectory())
            return docs;
    }
    catch {
        /* no Documents folder */
    }
    return path.join(process.cwd(), "dev-workflow-reports");
}
/** Resolve the base output directory; defaults per {@link defaultOutputDir}. */
function resolveOutputDir(cfg) {
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
function prepareOutPath(outPath, opts = {}) {
    if (!fs.existsSync(outPath))
        return outPath;
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
        console.warn(`⚠ Overwriting existing ${base}${ext} (${kb} KB). Pass --no-clobber to keep both.`);
    }
    catch {
        /* stat failed; proceed */
    }
    return outPath;
}
/**
 * Resolve where a specific report kind is written. Precedence:
 * per-kind override (checklistDir/worklogDir) → outputDir → default.
 */
function resolveReportDir(cfg, kind) {
    const perKind = kind === "checklist" ? cfg.checklistDir : cfg.worklogDir;
    const dir = perKind || cfg.outputDir || defaultOutputDir();
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
