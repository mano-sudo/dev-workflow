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
exports.getSessionPath = getSessionPath;
exports.readSession = readSession;
exports.appendActivity = appendActivity;
exports.todaysActivities = todaysActivities;
exports.resetDaily = resetDaily;
exports.archiveCompleted = archiveCompleted;
/**
 * session.ts — persistent activity log for the current working day.
 *
 * Live entries are stored as an ActivityEntry[] at storageDir()/session.json.
 * When a new day begins, prior entries are archived to storageDir()/completed.json
 * (an appended ActivityEntry[]) and the live session is cleared.
 *
 * All operations are defensive and never throw on I/O or parse errors.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
/** Absolute path to the live session file. */
function getSessionPath() {
    return path.join((0, config_1.storageDir)(), "session.json");
}
/** Absolute path to the archive of completed (past-day) activities. */
function getCompletedPath() {
    return path.join((0, config_1.storageDir)(), "completed.json");
}
/** Local ISO date "YYYY-MM-DD". */
function today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function readJsonArray(file) {
    try {
        const raw = fs.readFileSync(file, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return [];
    }
    catch {
        return [];
    }
}
function writeJsonArray(file, entries) {
    try {
        (0, config_1.ensureDirs)();
        fs.writeFileSync(file, JSON.stringify(entries, null, 2) + "\n", "utf8");
    }
    catch {
        /* swallow — tracking must never break the caller */
    }
}
/** Read all entries currently in the live session. Never throws. */
function readSession() {
    return readJsonArray(getSessionPath());
}
/**
 * Append a single activity to the live session.
 * Rolls the day first so entries never mix across days.
 */
function appendActivity(entry) {
    resetDaily();
    const normalized = {
        ...entry,
        date: entry.date || today(),
    };
    const entries = readSession();
    entries.push(normalized);
    writeJsonArray(getSessionPath(), entries);
}
/** Entries in the live session that belong to the current local day. */
function todaysActivities() {
    const t = today();
    return readSession().filter((e) => (e.date || t) === t);
}
/**
 * If the live session contains entries from a previous day, archive all of them
 * to completed.json and clear the live session. No-op when everything is from
 * today (or the session is empty).
 */
function resetDaily() {
    const entries = readSession();
    if (entries.length === 0)
        return;
    const t = today();
    const stale = entries.filter((e) => (e.date || t) !== t);
    if (stale.length === 0)
        return;
    const fresh = entries.filter((e) => (e.date || t) === t);
    const archive = readJsonArray(getCompletedPath());
    archive.push(...stale);
    writeJsonArray(getCompletedPath(), archive);
    writeJsonArray(getSessionPath(), fresh);
}
/**
 * Force-archive the entire live session (regardless of date) into
 * completed.json and clear it. Used at explicit end-of-day / report time.
 */
function archiveCompleted() {
    const entries = readSession();
    if (entries.length === 0)
        return;
    const archive = readJsonArray(getCompletedPath());
    archive.push(...entries);
    writeJsonArray(getCompletedPath(), archive);
    writeJsonArray(getSessionPath(), []);
}
