/** True while the background poller is active. */
export declare function isTracking(): boolean;
/**
 * Start silent background tracking for `cwd` (defaults to process.cwd()).
 * No-op if disabled in config or already running. Safe to run headless.
 */
export declare function startBackgroundTracking(cwd?: string): Promise<void>;
/** Stop the background poller. Idempotent. */
export declare function stopBackgroundTracking(): void;
