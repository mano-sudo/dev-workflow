/**
 * session.ts — persistent activity log for the current working day.
 *
 * Live entries are stored as an ActivityEntry[] at storageDir()/session.json.
 * When a new day begins, prior entries are archived to storageDir()/completed.json
 * (an appended ActivityEntry[]) and the live session is cleared.
 *
 * All operations are defensive and never throw on I/O or parse errors.
 */
import * as fs from "fs";
import * as path from "path";
import { ActivityEntry } from "../types";
import { storageDir, ensureDirs } from "../config";

/** Absolute path to the live session file. */
export function getSessionPath(): string {
  return path.join(storageDir(), "session.json");
}

/** Absolute path to the archive of completed (past-day) activities. */
function getCompletedPath(): string {
  return path.join(storageDir(), "completed.json");
}

/** Local ISO date "YYYY-MM-DD". */
function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readJsonArray(file: string): ActivityEntry[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as ActivityEntry[];
    }
    return [];
  } catch {
    return [];
  }
}

function writeJsonArray(file: string, entries: ActivityEntry[]): void {
  try {
    ensureDirs();
    fs.writeFileSync(file, JSON.stringify(entries, null, 2) + "\n", "utf8");
  } catch {
    /* swallow — tracking must never break the caller */
  }
}

/** Read all entries currently in the live session. Never throws. */
export function readSession(): ActivityEntry[] {
  return readJsonArray(getSessionPath());
}

/**
 * Append a single activity to the live session.
 * Rolls the day first so entries never mix across days.
 */
export function appendActivity(entry: ActivityEntry): void {
  resetDaily();
  const normalized: ActivityEntry = {
    ...entry,
    date: entry.date || today(),
  };
  const entries = readSession();
  entries.push(normalized);
  writeJsonArray(getSessionPath(), entries);
}

/** Entries in the live session that belong to the current local day. */
export function todaysActivities(): ActivityEntry[] {
  const t = today();
  return readSession().filter((e) => (e.date || t) === t);
}

/**
 * If the live session contains entries from a previous day, archive all of them
 * to completed.json and clear the live session. No-op when everything is from
 * today (or the session is empty).
 */
export function resetDaily(): void {
  const entries = readSession();
  if (entries.length === 0) return;

  const t = today();
  const stale = entries.filter((e) => (e.date || t) !== t);
  if (stale.length === 0) return;

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
export function archiveCompleted(): void {
  const entries = readSession();
  if (entries.length === 0) return;
  const archive = readJsonArray(getCompletedPath());
  archive.push(...entries);
  writeJsonArray(getCompletedPath(), archive);
  writeJsonArray(getSessionPath(), []);
}
