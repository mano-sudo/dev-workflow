"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.track = track;
exports.trackFeature = trackFeature;
exports.trackBugfix = trackBugfix;
exports.trackCommit = trackCommit;
exports.trackCommand = trackCommand;
exports.trackTest = trackTest;
exports.trackBuild = trackBuild;
exports.trackRefactor = trackRefactor;
exports.trackPackage = trackPackage;
exports.trackMigration = trackMigration;
const session_1 = require("./session");
/** Local wall-clock time as "HH:MM" (24h). */
function nowHM() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}
/** Local ISO date "YYYY-MM-DD". */
function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
/**
 * Record an activity of `type` with a human `description` and optional
 * structured `meta`. Timestamped "HH:MM" / today's date. Never throws.
 */
function track(type, description, meta) {
    const entry = {
        time: nowHM(),
        type,
        description,
        date: todayISO(),
    };
    if (meta && Object.keys(meta).length > 0) {
        entry.meta = meta;
    }
    (0, session_1.appendActivity)(entry);
}
function trackFeature(description, meta) {
    track("feature", description, meta);
}
function trackBugfix(description, meta) {
    track("bugfix", description, meta);
}
function trackCommit(description, meta) {
    track("commit", description, meta);
}
function trackCommand(description, meta) {
    track("command", description, meta);
}
function trackTest(description, meta) {
    track("test", description, meta);
}
function trackBuild(description, meta) {
    track("build", description, meta);
}
function trackRefactor(description, meta) {
    track("refactor", description, meta);
}
function trackPackage(description, meta) {
    track("package", description, meta);
}
function trackMigration(description, meta) {
    track("migration", description, meta);
}
