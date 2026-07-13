---
description: Show today's tracked development activity and current progress at a glance.
---

Show the developer a snapshot of today's work using dev-workflow's background
tracking and git context. Do not fabricate activity — only report what is actually
recorded.

Arguments passed: `$ARGUMENTS`

## Run

```
npx dev-workflow status $ARGUMENTS
```

Fallback: `node bin/cli.js status`.

This reads `~/.claude/dev-workflow/storage/session.json` (tracked activity) and, if
inside a git repo, the current branch / changed files / recent commits.

## Present results

Summarize clearly:

- **Tracked activity** — grouped by type (features, bugfixes, commits, files
  changed, etc.) with times.
- **Git context** — branch, uncommitted changes, recent commits.
- **Suggested next step** — offer to run `/worklog` to turn this into a report, or
  `/checklist` to plan remaining work.

If background tracking is disabled in config, say so and mention it can be enabled
with `/config`.
