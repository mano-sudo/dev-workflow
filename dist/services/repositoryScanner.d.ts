import { ScanFinding } from "../types";
/**
 * Scan the repository rooted at `cwd` (defaults to process.cwd()).
 * Returns findings sorted by priority (critical first). Never throws.
 */
export declare function scanRepository(cwd?: string): Promise<ScanFinding[]>;
