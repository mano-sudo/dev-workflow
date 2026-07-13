import { ActivityEntry } from "../types";
/** Absolute path to the live session file. */
export declare function getSessionPath(): string;
/** Read all entries currently in the live session. Never throws. */
export declare function readSession(): ActivityEntry[];
/**
 * Append a single activity to the live session.
 * Rolls the day first so entries never mix across days.
 */
export declare function appendActivity(entry: ActivityEntry): void;
/** Entries in the live session that belong to the current local day. */
export declare function todaysActivities(): ActivityEntry[];
/**
 * If the live session contains entries from a previous day, archive all of them
 * to completed.json and clear the live session. No-op when everything is from
 * today (or the session is empty).
 */
export declare function resetDaily(): void;
/**
 * Force-archive the entire live session (regardless of date) into
 * completed.json and clear it. Used at explicit end-of-day / report time.
 */
export declare function archiveCompleted(): void;
