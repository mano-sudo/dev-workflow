export declare function run(args: string[]): Promise<void>;
/**
 * Append a record of the generated report to storage/completed.json so the
 * history command can list it. Best-effort; never throws.
 */
declare function recordCompleted(kind: "checklist" | "worklog", files: string[], meta: Record<string, unknown>): void;
export { recordCompleted };
