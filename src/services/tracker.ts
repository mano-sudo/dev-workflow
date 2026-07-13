/**
 * tracker.ts — thin, timestamped convenience wrappers over the session store.
 *
 * Every call records an ActivityEntry stamped with the current local "HH:MM"
 * time and today's ISO date. These are the primitives commands and the
 * background poller use to log work.
 */
import { ActivityType, ActivityEntry } from "../types";
import { appendActivity } from "./session";

/** Local wall-clock time as "HH:MM" (24h). */
function nowHM(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Local ISO date "YYYY-MM-DD". */
function todayISO(): string {
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
export function track(
  type: ActivityType,
  description: string,
  meta?: Record<string, unknown>
): void {
  const entry: ActivityEntry = {
    time: nowHM(),
    type,
    description,
    date: todayISO(),
  };
  if (meta && Object.keys(meta).length > 0) {
    entry.meta = meta;
  }
  appendActivity(entry);
}

export function trackFeature(description: string, meta?: Record<string, unknown>): void {
  track("feature", description, meta);
}

export function trackBugfix(description: string, meta?: Record<string, unknown>): void {
  track("bugfix", description, meta);
}

export function trackCommit(description: string, meta?: Record<string, unknown>): void {
  track("commit", description, meta);
}

export function trackCommand(description: string, meta?: Record<string, unknown>): void {
  track("command", description, meta);
}

export function trackTest(description: string, meta?: Record<string, unknown>): void {
  track("test", description, meta);
}

export function trackBuild(description: string, meta?: Record<string, unknown>): void {
  track("build", description, meta);
}

export function trackRefactor(description: string, meta?: Record<string, unknown>): void {
  track("refactor", description, meta);
}

export function trackPackage(description: string, meta?: Record<string, unknown>): void {
  track("package", description, meta);
}

export function trackMigration(description: string, meta?: Record<string, unknown>): void {
  track("migration", description, meta);
}
