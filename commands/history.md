---
description: List previously generated checklists and worklogs, and re-open or re-export a past report.
---

Help the developer browse their history of generated reports and completed work
recorded by dev-workflow.

Arguments passed: `$ARGUMENTS`

## Run

```
npx dev-workflow history $ARGUMENTS
```

Fallback: `node bin/cli.js history`.

This reads `~/.claude/dev-workflow/storage/completed.json` and the configured output
directory to list prior checklists and worklogs (by date, project, and file).

## Present results

Show a chronological list: date, document type (Checklist / Worklog), project, and
output file path. If the developer names a specific entry, offer to re-open the file
or re-export it in another format. If there is no history yet, say so and suggest
running `/checklist` or `/worklog` to create the first report.
