---
description: Create a Development Worklog reporting what was actually completed today, and export it as a professional PDF.
---

You are helping the developer produce a **Development Worklog** — an honest daily
report of work actually completed. Follow the authoring guidance in
`~/.claude/dev-workflow/prompts/worklog.md` (also shipped at `prompts/worklog.md`).
**Never invent completed work.** Only report tasks supported by the repository,
git history, background tracking, or explicit developer input. When confidence is
low, ask for clarification.

## Step 1 — Auto-generate from what was completed

Arguments passed: `$ARGUMENTS`

When the developer runs `/worklog`, the worklog **generates itself first** from
what was actually done today:

- **tracked activity** in `~/.claude/dev-workflow/storage/session.json`
  (features, bug fixes, refactors → Completed checklist rows; other events →
  additional work), and
- **git** — recent commits and pending changes.

**Never invent completed work** — only report what the tracking/git/checklist or
the developer actually confirm.

## Step 2 — Review and add (interactive)

After the automatic draft, let the developer review the auto-detected completed
tasks and **add to them, typed one at a time**: any extra completed tasks (with an
optional result), additional work, tasks NOT completed, blockers, next priorities,
notes, total hours, and overall status (On Schedule / Slight Delay / Delayed).
The auto-detected items are the starting point — the developer only adds what is
missing. Pass `--auto` to accept the generated worklog with no questions.

## Step 3 — Generate

```
npx dev-workflow worklog $ARGUMENTS      # auto-draft, then review/add in a terminal
npx dev-workflow worklog --auto          # accept the auto-generated worklog as-is
npx dev-workflow worklog --blank         # printable empty form
```

Fallback if `npx` is unavailable: `node bin/cli.js worklog`.

## Step 4 — Present results

Report the output file path, give a concise summary (X of Y planned tasks completed,
overall progress %, status, key blockers, next priorities). Offer to re-export in a
different format or revise entries. Flag clearly if any item could not be verified.
