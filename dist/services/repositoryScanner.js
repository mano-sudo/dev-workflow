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
exports.scanRepository = scanRepository;
/**
 * repositoryScanner.ts — heuristic static analysis of a working tree.
 *
 * Walks the tree (skipping vendored / build dirs) and returns prioritized
 * findings: TODO/FIXME markers, very large files, likely-missing tests,
 * dead-file heuristics, and potential security risks. Never throws.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "vendor",
    "coverage",
    ".cache",
    "out",
    ".turbo",
    ".svn",
    ".hg",
    "__pycache__",
]);
/** File extensions we treat as source code worth scanning line-by-line. */
const SOURCE_EXT = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".rb",
    ".java",
    ".kt",
    ".rs",
    ".php",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".cs",
    ".swift",
    ".scala",
    ".vue",
    ".svelte",
]);
/** Caps to keep output bounded and scans fast. */
const MAX_FILES = 4000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FINDINGS = 200;
const MAX_PER_CATEGORY = 40;
const LARGE_FILE_LINES = 1500;
const SECURITY_PATTERNS = [
    {
        re: /(?:aws_secret_access_key|aws_access_key_id)\s*[=:]\s*['"][^'"]+['"]/i,
        message: "Possible hardcoded AWS credential",
        priority: "critical",
    },
    {
        re: /(?:api[_-]?key|secret|passwd|password|token|private[_-]?key)\s*[=:]\s*['"][A-Za-z0-9_\-\/+]{8,}['"]/i,
        message: "Possible hardcoded secret/credential",
        priority: "high",
    },
    {
        re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
        message: "Embedded private key material",
        priority: "critical",
    },
    {
        re: /\beval\s*\(/,
        message: "Use of eval() — potential code-injection risk",
        priority: "high",
    },
    {
        re: /new\s+Function\s*\(/,
        message: "Dynamic Function constructor — potential code-injection risk",
        priority: "medium",
    },
    {
        re: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*[`'"][^`'"]*[`'"]?\s*\+/,
        message: "Shell command built via string concatenation — injection risk",
        priority: "high",
    },
    {
        re: /(?:exec|execSync)\s*\(\s*`[^`]*\$\{/,
        message: "Shell command with interpolated input — injection risk",
        priority: "high",
    },
];
const TODO_RE = /(?:\/\/|#|\/\*|\*)\s*(TODO|FIXME|HACK|XXX)\b[:\s]?(.*)/i;
const PRIORITY_RANK = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
/** Recursively collect candidate files, honoring skip list and caps. */
function walk(root) {
    const out = [];
    const stack = [root];
    while (stack.length > 0 && out.length < MAX_FILES) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const abs = path.join(dir, entry.name);
            if (entry.isSymbolicLink())
                continue;
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name))
                    continue;
                if (entry.name.startsWith(".") && entry.name !== ".") {
                    // Skip hidden dirs other than the root; avoids .venv, .idea, etc.
                    continue;
                }
                stack.push(abs);
            }
            else if (entry.isFile()) {
                out.push({
                    abs,
                    rel: path.relative(root, abs) || entry.name,
                    ext: path.extname(entry.name).toLowerCase(),
                });
                if (out.length >= MAX_FILES)
                    break;
            }
        }
    }
    return out;
}
const TEST_HINT = /(\.(test|spec)\.[a-z]+$)|(_test\.[a-z]+$)|(^|\/)(tests?|__tests__|spec)(\/|$)/i;
function looksLikeTest(rel) {
    return TEST_HINT.test(rel);
}
/** Heuristic: does this path live in a conventional source directory? */
function inSourceDir(rel) {
    return /(^|\/)(src|lib|app|source)(\/|$)/i.test(rel);
}
/**
 * Scan the repository rooted at `cwd` (defaults to process.cwd()).
 * Returns findings sorted by priority (critical first). Never throws.
 */
async function scanRepository(cwd) {
    const root = cwd || process.cwd();
    const findings = [];
    const counts = {};
    const add = (f) => {
        const c = counts[f.category] || 0;
        if (c >= MAX_PER_CATEGORY)
            return;
        if (findings.length >= MAX_FINDINGS)
            return;
        counts[f.category] = c + 1;
        findings.push(f);
    };
    let files;
    try {
        files = walk(root);
    }
    catch {
        return [];
    }
    const sourceFiles = files.filter((f) => SOURCE_EXT.has(f.ext));
    const hasAnyTests = files.some((f) => looksLikeTest(f.rel));
    // Directories that contain source but no colocated test.
    const dirsWithSource = new Set();
    const dirsWithTests = new Set();
    for (const file of sourceFiles) {
        const dir = path.dirname(file.rel);
        if (looksLikeTest(file.rel)) {
            dirsWithTests.add(dir);
        }
        else if (inSourceDir(file.rel)) {
            dirsWithSource.add(dir);
        }
        let content;
        try {
            const stat = fs.statSync(file.abs);
            if (stat.size > MAX_FILE_BYTES) {
                add({
                    priority: "low",
                    category: "large-file",
                    file: file.rel,
                    message: `File is ${(stat.size / 1024).toFixed(0)}KB — consider splitting`,
                });
                continue;
            }
            content = fs.readFileSync(file.abs, "utf8");
        }
        catch {
            continue;
        }
        const lines = content.split("\n");
        if (lines.length > LARGE_FILE_LINES) {
            add({
                priority: "medium",
                category: "large-file",
                file: file.rel,
                message: `Very large file: ${lines.length} lines (>${LARGE_FILE_LINES})`,
            });
        }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.length > 4000)
                continue; // skip minified/generated lines
            const todo = TODO_RE.exec(line);
            if (todo) {
                const kind = todo[1].toUpperCase();
                const text = (todo[2] || "").trim();
                add({
                    priority: kind === "FIXME" || kind === "XXX" ? "medium" : "low",
                    category: "todo",
                    file: file.rel,
                    line: i + 1,
                    message: `${kind}${text ? ": " + text.slice(0, 120) : ""}`,
                });
            }
            for (const pat of SECURITY_PATTERNS) {
                if (pat.re.test(line)) {
                    add({
                        priority: pat.priority,
                        category: "security",
                        file: file.rel,
                        line: i + 1,
                        message: pat.message,
                    });
                }
            }
        }
    }
    // Likely-missing tests.
    if (sourceFiles.length > 0 && !hasAnyTests) {
        add({
            priority: "high",
            category: "missing-tests",
            message: `No test files detected across ${sourceFiles.length} source file(s)`,
        });
    }
    else {
        for (const dir of dirsWithSource) {
            if (!dirsWithTests.has(dir)) {
                add({
                    priority: "low",
                    category: "missing-tests",
                    file: dir || ".",
                    message: "Source directory has no colocated test files",
                });
            }
        }
    }
    // Dead / unused file heuristics.
    const referenced = new Set();
    for (const file of sourceFiles) {
        referenced.add(path.basename(file.rel, file.ext));
    }
    // Build a corpus of all source content basenames referenced via import/require.
    const importRefs = new Set();
    const importRe = /(?:import\s.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
    for (const file of sourceFiles) {
        let content;
        try {
            const stat = fs.statSync(file.abs);
            if (stat.size > MAX_FILE_BYTES)
                continue;
            content = fs.readFileSync(file.abs, "utf8");
        }
        catch {
            continue;
        }
        let m;
        while ((m = importRe.exec(content)) !== null) {
            const spec = m[1];
            if (spec.startsWith(".")) {
                importRefs.add(path.basename(spec).replace(/\.[a-z]+$/i, ""));
            }
        }
    }
    const ENTRY_HINTS = /(^|\/)(index|main|cli|app|server|setup|config|types|__init__)$/i;
    for (const file of sourceFiles) {
        if (looksLikeTest(file.rel))
            continue;
        const base = path.basename(file.rel, file.ext);
        if (ENTRY_HINTS.test(base))
            continue;
        if (!inSourceDir(file.rel))
            continue;
        if (!importRefs.has(base)) {
            add({
                priority: "low",
                category: "possibly-unused",
                file: file.rel,
                message: "Module is never imported by a relative path — possibly dead code",
            });
        }
    }
    findings.sort((a, b) => {
        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pr !== 0)
            return pr;
        if (a.category !== b.category)
            return a.category.localeCompare(b.category);
        const fa = a.file || "";
        const fb = b.file || "";
        if (fa !== fb)
            return fa.localeCompare(fb);
        return (a.line || 0) - (b.line || 0);
    });
    return findings.slice(0, MAX_FINDINGS);
}
