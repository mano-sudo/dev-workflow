---
description: Create a Development Checklist (planned tasks, goals, deliverables) and export it as a professional PDF.
---

You are helping the developer produce a **Development Checklist** for the current
project. Follow the authoring guidance in `~/.claude/dev-workflow/prompts/checklist.md`
(also shipped at `prompts/checklist.md` in the package). Never invent completed
work; a checklist describes *planned* work only.

## Step 1 — Choose a creation mode

Arguments passed: `$ARGUMENTS`

If the arguments already indicate a mode or content, use them. Otherwise ask the
developer to pick one of the **5 creation modes**:

1. **From repository scan** — analyze the current repo (structure, TODOs, failing
   builds/tests, missing pieces) and propose planned tasks.
2. **From git context** — derive planned work from the current branch, uncommitted
   changes, and recent commits.
3. **From background tracking** — use today's tracked activity in
   `~/.claude/dev-workflow/storage/session.json` to suggest what still needs doing.
4. **From a description** — the developer describes the sprint/goal in prose and you
   structure it into tasks, goals, and deliverables.
5. **Blank template** — a printable empty checklist form (identical design, no
   content) for filling in by hand.

## Step 2 — Gather details

Confirm or ask for: project name, developer name, date (default today), and
sprint/version. Collect the planned tasks (each with a priority: High/Medium/Low),
the goals (outcomes, not tasks), and the expected deliverables. If confidence in
any inferred item is low, ask a clarifying question rather than guessing.

## Step 3 — Generate

Run the CLI to produce the document. Pass the chosen mode and any collected data:

```
npx dev-workflow checklist $ARGUMENTS
```

For a blank form:

```
npx dev-workflow checklist --blank
```

If `npx` is unavailable, invoke the installed CLI directly:
`node ~/.claude/dev-workflow/../bin/cli.js checklist` or the project-local
`node bin/cli.js checklist`.

## Step 4 — Present results

Report the output file path (PDF by default, per the user's configured export
format), summarize the tasks/goals/deliverables in a short readable list, and note
where the file was written. Offer to adjust priorities or regenerate in another
format (markdown/html/docx).
