---
description: Create a Development Checklist (planned tasks, goals, deliverables) and export it as a professional PDF.
---

You are helping the developer produce a **Development Checklist** for the current
project. Follow the authoring guidance in `~/.claude/dev-workflow/prompts/checklist.md`
(also shipped at `prompts/checklist.md` in the package). Never invent completed
work; a checklist describes *planned* work only.

## Step 1 — Choose one or MORE sources

Arguments passed: `$ARGUMENTS`

The checklist can be built from **several sources at once** — they combine into a
single list (duplicates removed). Ask the developer to pick any combination:

1. **Manual entry** — the developer types tasks one at a time (see Step 2).
2. **Scan repository** — analyze the repo (structure, TODOs/FIXMEs, missing tests,
   dead code, risks) and propose planned tasks.
3. **From a spec / markdown file** — compare a spec against the code (`--spec <file>`).
4. **From a previous report** — carry over unfinished items (`--from <file>`).
5. **AI-assisted** — synthesize from git context + today's tracked activity.

Multiple selections combine, e.g. `2,1` = scan the repo **and** let the developer
add their own typed tasks on top.

## Step 2 — Type tasks checklist-style (for Manual entry)

When Manual entry is chosen, collect tasks **one at a time, like a real checklist**:
ask for the first task's text, then its priority (High/Medium/Low, default Medium),
then optional notes — then immediately move on to the next task. Keep going until
the developer signals they are done (an empty task). Then collect the goals
(outcomes, not tasks) and expected deliverables the same way.

Also confirm or ask for: project name, developer name, date (default today), and
sprint/version. If confidence in any inferred item is low, ask rather than guess.

## Step 3 — Generate

Run the CLI. In a terminal it walks the developer through the multi-select and the
task-by-task entry interactively; you can also pass everything as flags. Combine
sources with a comma:

```
npx dev-workflow checklist --mode=scan,manual $ARGUMENTS
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
