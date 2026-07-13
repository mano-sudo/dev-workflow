/**
 * tracker.ts — thin, timestamped convenience wrappers over the session store.
 *
 * Every call records an ActivityEntry stamped with the current local "HH:MM"
 * time and today's ISO date. These are the primitives commands and the
 * background poller use to log work.
 */
import { ActivityType } from "../types";
/**
 * Record an activity of `type` with a human `description` and optional
 * structured `meta`. Timestamped "HH:MM" / today's date. Never throws.
 */
export declare function track(type: ActivityType, description: string, meta?: Record<string, unknown>): void;
export declare function trackFeature(description: string, meta?: Record<string, unknown>): void;
export declare function trackBugfix(description: string, meta?: Record<string, unknown>): void;
export declare function trackCommit(description: string, meta?: Record<string, unknown>): void;
export declare function trackCommand(description: string, meta?: Record<string, unknown>): void;
export declare function trackTest(description: string, meta?: Record<string, unknown>): void;
export declare function trackBuild(description: string, meta?: Record<string, unknown>): void;
export declare function trackRefactor(description: string, meta?: Record<string, unknown>): void;
export declare function trackPackage(description: string, meta?: Record<string, unknown>): void;
export declare function trackMigration(description: string, meta?: Record<string, unknown>): void;
