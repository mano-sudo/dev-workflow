---
description: Create a Development Worklog reporting what was actually completed today, and export it as a professional PDF.
---

You are helping the developer produce a **Development Worklog** — an honest daily
report of work actually completed. Follow the authoring guidance in
`~/.claude/dev-workflow/prompts/worklog.md` (also shipped at `prompts/worklog.md`).
**Never invent completed work.** Only report tasks supported by the repository,
git history, background tracking, or explicit developer input. When confidence is
low, ask for clarification.

## Step 1 — Choose a source

Arguments passed: `$ARGUMENTS`

Ask the developer (or infer from arguments) how to build the worklog:

1. **Against a checklist** — reconcile today's work against an existing checklist
   (e.g. `CASERES_CHECKLIST_07-11-2026`); mark each planned task Completed / Partial
   / Not Done with a result.
2. **From git + tracking** — summarize commits, diffs, and tracked activity from
   `~/.claude/dev-workflow/storage/session.json` into completed work.
3. **From a description** — the developer narrates the day and you structure it.
4. **Blank template** — a printable empty worklog form for filling in by hand.

## Step 2 — Gather details

Confirm: project, developer, date (default today), sprint/version, optional
checklist reference. Collect checklist completion rows, additional tasks completed,
tasks not completed, blockers, next priorities, rough time allocation (planning,
development, testing, bug fixes, meetings, total hours), and overall status
(On Schedule / Slight Delay / Delayed) with notes.

## Step 3 — Generate

```
npx dev-workflow worklog $ARGUMENTS
```

For a blank form:

```
npx dev-workflow worklog --blank
```

Fallback if `npx` is unavailable: `node bin/cli.js worklog`.

## Step 4 — Present results

Report the output file path, give a concise summary (X of Y planned tasks completed,
overall progress %, status, key blockers, next priorities). Offer to re-export in a
different format or revise entries. Flag clearly if any item could not be verified.
