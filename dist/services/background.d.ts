/** True while the background poller is active. */
export declare function isTracking(): boolean;
/**
 * Start silent background tracking for `cwd` (defaults to process.cwd()).
 * No-op if disabled in config or already running. Safe to run headless.
 */
export declare function startBackgroundTracking(cwd?: string): Promise<void>;
/** Stop the background poller. Idempotent. */
export declare function stopBackgroundTracking(): void;
/**
 * Run a single git reconcile against a disk-persisted snapshot. Records new
 * commits, branch switches, and newly-changed working-tree files, then saves
 * the new snapshot. Silent and never throws — safe to call from a hook.
 */
export declare function pollOnce(cwd?: string): Promise<void>;
