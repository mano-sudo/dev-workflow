import { GitContext } from "../types";
/**
 * Gather a git snapshot of `cwd` (defaults to process.cwd()).
 * Never throws; returns { isRepo: false } when not in a repo or git is missing.
 */
export declare function getGitContext(cwd?: string): Promise<GitContext>;
