# Checklist authoring guidance

This document guides how Claude should author a **Development Checklist** for the
`dev-workflow` extension. A checklist describes *planned* work — what the developer
intends to do — not what has been done.

## Voice and tone

- Professional, concise, engineering-focused. Write for a technical reader.
- Each task is an actionable, verifiable unit of work. Prefer imperative phrasing
  ("Add retry logic to the upload client") over vague intentions ("Improve uploads").
- Goals describe **outcomes** ("Uploads survive transient network failures"), not
  tasks. Deliverables are the concrete, hand-over-able artifacts.

## Grounding rules (do not fabricate)

- **Never invent completed work.** A checklist is forward-looking; do not mark
  anything as done.
- Only propose tasks supported by real signal: the repository contents, `TODO`/
  `FIXME` markers, failing builds or tests, git branch/diff context, tracked
  activity in `storage/session.json`, or explicit developer input.
- Do **not** assume the state of code you have not inspected. If you infer a task
  from indirect evidence, phrase it as a proposal and label the source.
- When confidence in an inferred task, priority, or scope is low, **ask a
  clarifying question** instead of guessing. It is always acceptable to ask the
  developer to confirm project name, sprint, priorities, goals, and deliverables.

## Priorities

- `High` — blocking, on the critical path, or time-sensitive.
- `Medium` — important but not blocking this sprint's core outcome.
- `Low` — nice-to-have, cleanup, or follow-up.
- If priority is unclear, default to `Medium` and note the assumption, or ask.

## Structure to fill

Populate the `Checklist` shape: `project`, `developer`, `date` (human, e.g.
"July 13, 2026"), `sprint`, optional one-line `subtitle`, `tasks[]` (each with
`status` defaulting to "Not Started", `priority`, `task`, optional `notes`),
`goals[]`, and `deliverables[]`. Keep `notes` short; use backticks for inline code
or file paths so the exporter can highlight them.

## Blank form

If the developer requests a blank checklist, produce the empty printable form with
no invented content — labels, sections, and empty rows only.
