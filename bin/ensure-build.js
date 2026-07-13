#!/usr/bin/env node
/**
 * postinstall guard.
 *
 * dev-workflow ships a prebuilt `dist/` in the repo/package, so normally there
 * is nothing to do. If `dist/` is somehow missing (e.g. a source-only checkout)
 * and the TypeScript compiler is available, we build it. This script must NEVER
 * fail an install — it always exits 0.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

try {
  const root = path.join(__dirname, "..");
  const entry = path.join(root, "dist", "index.js");
  if (fs.existsSync(entry)) {
    // Prebuilt output already present — nothing to do.
    process.exit(0);
  }
  // Only attempt a build if a local TypeScript compiler is resolvable.
  const localTsc = path.join(root, "node_modules", ".bin", "tsc");
  const hasLocalTsc = fs.existsSync(localTsc);
  if (!hasLocalTsc) {
    console.warn(
      "[dev-workflow] dist/ not found and no local TypeScript compiler. " +
        "Run `npm run build` from the package directory if commands fail."
    );
    process.exit(0);
  }
  console.log("[dev-workflow] Building dist/ …");
  execSync(`"${localTsc}" -p tsconfig.json`, { cwd: root, stdio: "inherit" });
} catch (err) {
  // Never block installation.
  console.warn(
    "[dev-workflow] Optional build step skipped: " +
      (err && err.message ? err.message : String(err))
  );
}
process.exit(0);
