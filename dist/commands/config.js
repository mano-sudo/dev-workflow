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
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const config_1 = require("../config");
const EDITABLE = [
    "backgroundTracking",
    "autoSave",
    "export",
    "template",
    "outputDir",
    "checklistDir",
    "worklogDir",
    "developer",
];
/** Expand a leading ~ to the user's home directory. */
function expandHome(p) {
    if (p === "~")
        return os.homedir();
    if (p.startsWith("~/") || p.startsWith("~\\")) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}
const VALID_FORMATS = ["pdf", "markdown", "md", "docx", "html"];
function ask(rl, q) {
    return new Promise((resolve) => rl.question(q, (a) => resolve(a)));
}
function hasTTY() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
function isEditable(key) {
    return EDITABLE.includes(key);
}
function parseBool(v) {
    return /^(1|true|yes|y|on)$/i.test(v.trim());
}
/** Coerce a raw string into the correct typed value; throws on bad input. */
function coerce(key, raw) {
    const v = raw.trim();
    switch (key) {
        case "backgroundTracking":
        case "autoSave":
            return parseBool(v);
        case "export": {
            const f = v.toLowerCase();
            if (!VALID_FORMATS.includes(f)) {
                throw new Error(`Invalid export format "${v}". Choose one of: ${VALID_FORMATS.join(", ")}`);
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
function display(cfg) {
    console.log(`Config file: ${(0, config_1.configPath)()}`);
    for (const key of EDITABLE) {
        const val = cfg[key];
        console.log(`  ${key.padEnd(20)} = ${val === undefined ? "(unset)" : val}`);
    }
}
async function interactiveEdit(cfg) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        console.log("Edit dev-workflow config (press Enter to keep current value).\n");
        const bg = await ask(rl, `Background tracking [${cfg.backgroundTracking ? "on" : "off"}] (on/off): `);
        if (bg.trim())
            cfg.backgroundTracking = parseBool(bg);
        const auto = await ask(rl, `Auto-save reports [${cfg.autoSave ? "on" : "off"}] (on/off): `);
        if (auto.trim())
            cfg.autoSave = parseBool(auto);
        const fmt = await ask(rl, `Export format [${cfg.export}] (${VALID_FORMATS.join("/")}): `);
        if (fmt.trim())
            cfg.export = coerce("export", fmt);
        const tpl = await ask(rl, `Template [${cfg.template}]: `);
        if (tpl.trim())
            cfg.template = tpl.trim();
        const out = await ask(rl, `Base output directory [${cfg.outputDir || "(default: ~/Documents)"}]: `);
        if (out.trim())
            cfg.outputDir = expandHome(out.trim());
        const clDir = await ask(rl, `Checklist folder [${cfg.checklistDir || "(uses base output dir)"}]: `);
        if (clDir.trim())
            cfg.checklistDir = expandHome(clDir.trim());
        const wlDir = await ask(rl, `Worklog folder [${cfg.worklogDir || "(uses base output dir)"}]: `);
        if (wlDir.trim())
            cfg.worklogDir = expandHome(wlDir.trim());
        const dev = await ask(rl, `Developer name [${cfg.developer || "(unset)"}]: `);
        if (dev.trim())
            cfg.developer = dev.trim();
    }
    finally {
        rl.close();
    }
    (0, config_1.saveConfig)(cfg);
    console.log("\nSaved.");
    display(cfg);
}
async function run(args) {
    const cfg = (0, config_1.loadConfig)();
    const sub = args[0];
    if (sub === "get") {
        const key = args[1];
        if (!key) {
            display(cfg);
            return;
        }
        const val = cfg[key];
        console.log(val === undefined ? "" : String(val));
        return;
    }
    if (sub === "set") {
        const key = args[1];
        const value = args.slice(2).join(" ");
        if (!key)
            throw new Error("Usage: config set <key> <value>");
        if (!isEditable(key)) {
            throw new Error(`Unknown or read-only key "${key}". Editable: ${EDITABLE.join(", ")}`);
        }
        const coerced = coerce(key, value);
        if (coerced === undefined) {
            delete cfg[key];
        }
        else {
            cfg[key] = coerced;
        }
        (0, config_1.saveConfig)(cfg);
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
    }
    else {
        display(cfg);
    }
}
