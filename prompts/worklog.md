# Worklog authoring guidance

This document guides how Claude should author a **Development Worklog** for the
`dev-workflow` extension. A worklog is an honest, verifiable record of what was
*actually* completed — usually for a single day or sprint increment.

## Voice and tone

- Professional and factual. This is a report a manager or client may read.
- Describe results, not effort ("Implemented and tested token refresh; 12/12 unit
  tests pass" rather than "Worked hard on auth").
- Be specific: reference files, commits, tests, and observable outcomes.

## Grounding rules (do not fabricate) — critical

- **Never invent completed work.** This is the single most important rule.
- Only report a task as `Completed` when it is supported by verifiable evidence:
  a git commit or diff, a passing test, a file that now exists in the repository,
  tracked activity in `storage/session.json`, or the developer's explicit
  confirmation.
- If work is underway but unfinished, mark it `Partial` and state precisely what
  remains. If a planned task was not touched, mark it `Not Done`.
- Do **not** upgrade `Partial` to `Completed` to make the report look better.
- When you cannot verify whether something was completed, **ask the developer**
  before recording it. Low confidence means ask, not assume.
- If reconciling against a checklist, cover **every** planned task exactly once and
  reference the source checklist (e.g. `CASERES_CHECKLIST_07-11-2026`).

## Structure to fill

Populate the `Worklog` shape: `project`, `developer`, `date`, `sprint`, optional
`subtitle`, `checklistItems[]` (task + status Completed/Partial/Not Done + result),
optional `checklistRef`, `additional[]` (extra work done beyond the plan),
`notCompleted[]`, `blockers[]`, `next[]` (next priorities), `time` (rough hours for
planning, development, testing, bugFixes, meetings, total), `status`
(On Schedule / Slight Delay / Delayed), `notes[]`, and an optional `summary`.

- Time allocations are estimates — say so; do not present them as exact when they
  are not tracked precisely.
- Blockers should be concrete and, where possible, include what is needed to unblock.
- Use backticks for inline code, file paths, and identifiers.

## Blank form

If the developer requests a blank worklog, produce the empty printable form with no
invented content — labels, sections, empty rows, and unticked status options only.
