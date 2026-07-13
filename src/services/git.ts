/**
 * git.ts — read-only git context gathering.
 *
 * All functions are defensive: they never throw. If git is missing or the
 * directory is not a repository, getGitContext resolves to { isRepo: false }.
 */
import { execFile } from "child_process";
import { GitContext } from "../types";

/** Run a git command, resolving to trimmed stdout or null on any failure. */
function git(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        "git",
        args,
        { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          resolve(stdout.replace(/\s+$/, ""));
        }
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Gather a git snapshot of `cwd` (defaults to process.cwd()).
 * Never throws; returns { isRepo: false } when not in a repo or git is missing.
 */
export async function getGitContext(cwd?: string): Promise<GitContext> {
  const dir = cwd || process.cwd();

  const insideWorkTree = await git(["rev-parse", "--is-inside-work-tree"], dir);
  if (insideWorkTree !== "true") {
    return { isRepo: false };
  }

  const [branchRaw, statusRaw, logRaw, diffStatRaw] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"], dir),
    git(["status", "--porcelain"], dir),
    git(
      ["log", "-n", "10", "--pretty=format:%H%x1f%s%x1f%ad", "--date=short"],
      dir
    ),
    git(["diff", "--stat"], dir),
  ]);

  const context: GitContext = { isRepo: true };

  if (branchRaw) {
    context.branch = branchRaw.trim();
  }

  if (statusRaw !== null) {
    context.status = statusRaw;
    const changedFiles = statusRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => {
        // Porcelain format: "XY <path>" or "XY <old> -> <new>".
        const rest = l.slice(2).trim();
        const arrow = rest.split(" -> ");
        return (arrow.length > 1 ? arrow[1] : rest).trim();
      })
      .filter((f) => f.length > 0);
    context.changedFiles = changedFiles;
  }

  if (logRaw) {
    context.recentCommits = logRaw
      .split("\n")
      .map((line) => line.split(""))
      .filter((parts) => parts.length >= 3 && parts[0])
      .map((parts) => ({
        hash: parts[0].trim(),
        subject: parts[1].trim(),
        date: parts[2].trim(),
      }));
  }

  if (diffStatRaw) {
    context.diffStat = diffStatRaw;
  }

  return context;
}
