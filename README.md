# dev-workflow

> A Claude Code extension that turns your day of coding into professional Development Checklists, Worklogs, progress snapshots and engineering reports — with optional background activity tracking and one-command export to **PDF / Markdown / DOCX / HTML**.

`dev-workflow` adds a family of slash commands (`/checklist`, `/worklog`, `/status`, `/history`, `/config`) to Claude Code. It watches the work you do (git commits, file edits, commands, package installs), assembles it into pixel-accurate documents built from real reference reports, and renders them offline — no browser, no cloud, no extra runtime dependencies beyond `pdfkit`.

---

## Features

- **Two flagship documents** — a *Development Checklist* (what you plan to do) and a *Development Worklog* (what you actually did), rendered to a precise A4 design spec.
- **Five checklist modes** — `blank`, `interactive`, `from-git`, `from-session`, and `auto`.
- **Background tracking** — an opt-in recorder that logs commits, file create/edit/delete, commands, builds and package changes into `session.json`, so your worklog writes itself.
- **Multi-format export** — the same document model renders to **PDF**, **Markdown**, **DOCX**, and **HTML**.
- **Offline & dependency-light** — the only runtime dependency is `pdfkit`. Markdown→HTML, DOCX packaging and argument parsing are all hand-rolled.
- **Git integration** — reads branch, status, changed files, recent commits and diff stats to seed documents.
- **Repository scanner** — surfaces prioritized findings (TODOs, large files, missing tests, risky patterns) you can fold into a checklist.
- **Template engine** — simple `{{PLACEHOLDER}}` substitution over Markdown templates, so the wording is fully customizable.
- **Blank printable forms** — every document can render an empty, identically-structured version to fill in by hand.

---

## Folder structure

```
dev-workflow/
├── bin/
│   └── cli.js                 # `dev-workflow` executable (install + command runner)
├── commands/                  # Slash-command definitions surfaced to Claude Code
├── prompts/                   # Prompt fragments used by interactive modes
├── templates/                 # Markdown templates (checklist.md, worklog.md, …)
├── .claude-plugin/            # Claude Code plugin manifest
├── src/
│   ├── types.ts               # Shared type contract (Checklist, Worklog, config, …)
│   ├── config.ts              # Config + storage path helpers
│   ├── commands/              # /checklist /worklog /status /history /config impls
│   └── services/              # tracker, gitContext, repoScanner, templateEngine,
│                              # pdfExporter, mdExporter, docxExporter, htmlExporter
├── dist/                      # Compiled JS (created by `npm run build`)
├── storage/                   # Seed runtime storage (session.json, completed.json)
├── README.md
├── INSTALL.md
├── LICENSE
└── package.json
```

At runtime, config and live storage are kept under your home directory, not in the project:

```
~/.claude/dev-workflow/
├── config.json                # your persisted settings
└── storage/
    ├── session.json           # today's tracked activity
    └── completed.json         # rolled-over / archived sessions
```

---

## Installation

**Prerequisites:** Node.js **>= 18** and Claude Code installed.

The repo ships a **prebuilt `dist/`**, so no TypeScript/build step is ever
required to use it. The code just needs to land on the machine once (that's what
`git clone` / `npm install -g` does) — the extension is a local CLI + command
files, not a hosted service.

### Recommended — clone, then one setup command

```bash
git clone https://github.com/mano-sudo/dev-workflow.git
cd dev-workflow
npm run setup     # installs dependencies, then runs the extension installer
```

`npm run setup` = `npm install` (pulls the one runtime dep, `pdfkit`) **+**
`node bin/cli.js install` in a single command. Because `dist/` is committed,
there is nothing to compile. The installer registers the slash commands with
Claude Code, seeds `~/.claude/dev-workflow/`, and runs the first-run prompts.
Then **restart Claude Code** so the commands load.

### Alternative — install straight from GitHub

```bash
npm install -g git+https://github.com/mano-sudo/dev-workflow.git
dev-workflow install
```

Downloads and links the CLI globally, then registers the commands. (If your npm
environment has trouble installing directly from a git URL, use the clone method
above — it is the most reliable.)

### Once published to npm

```bash
npm install -g dev-workflow
dev-workflow install
```

See [INSTALL.md](./INSTALL.md) for verification, re-configuration and uninstall steps.

---

## First run — installer prompts

The installer asks two things:

```
Enable Background Tracking? (Recommended)  Yes / No
Where should reports be saved? [~/Documents]
Use separate folders for checklists and worklogs?  Yes / No
```

- **Background tracking** records git commits, file edits, and commands you run
  (locally, into `~/.claude/dev-workflow/storage`) so your worklog writes itself.
- **Output location** sets where PDFs land. Answering "separate folders" lets you
  send checklists and worklogs to different directories (e.g.
  `~/Documents/checklist` and `~/Documents/accomplishment`).

Answers are saved to `config.json`. Change them anytime:

```bash
dev-workflow config set backgroundTracking false
dev-workflow config set checklistDir ~/Documents/checklist
dev-workflow config set worklogDir   ~/Documents/accomplishment
dev-workflow config            # interactive editor
```

Non-interactive installs accept flags:
`dev-workflow install --yes --checklist-dir <dir> --worklog-dir <dir> [--no-tracking]`.

Existing reports are never clobbered silently — regenerating warns, and
`--no-clobber` writes a ` (2)` copy instead.

---

## Slash commands

### `/checklist` — build a Development Checklist

Five modes:

| Mode | Command | What it does |
|------|---------|--------------|
| **blank** | `/checklist blank` | Renders an empty, printable form with the full structure (8 empty task rows, all labels/legend/sections shown). |
| **interactive** | `/checklist` or `/checklist interactive` | Claude walks you through project, goals, tasks and deliverables, then renders. |
| **from-git** | `/checklist from-git` | Seeds tasks from your branch, changed files and recent commits. |
| **from-session** | `/checklist from-session` | Builds tasks from today's tracked `session.json` activity. |
| **auto** | `/checklist auto` | Combines git + session + repo scan into a best-effort draft. |

Examples:

```bash
/checklist blank
/checklist auto --export pdf
/checklist from-git --sprint "Sprint 14" --developer "Roman Caseres"
```

### `/worklog` — build a Development Worklog

Turns your checklist and tracked activity into an end-of-day worklog: checklist completion table, additional tasks, summary stats, blockers, next priorities, time spent and overall status.

```bash
/worklog                     # from today's tracked session
/worklog --from-checklist CASERES_CHECKLIST_07-11-2026
/worklog blank               # printable empty worklog form
/worklog --export markdown
```

### `/status` — snapshot of today

Prints a quick terminal summary: tracked activity so far, current git state, and how many planned tasks are done.

```bash
/status
```

### `/history` — browse past reports

Lists archived sessions in `completed.json` and generated reports, newest first.

```bash
/history
/history --limit 10
```

### `/config` — view or change settings

```bash
/config                              # print current config
/config set export docx
/config set outputDir ~/Reports
/config set backgroundTracking false
/config set developer "Roman Caseres"
/config reset
```

---

## Background tracking

When enabled, the tracker appends `ActivityEntry` records to `~/.claude/dev-workflow/storage/session.json`. It records:

- **commits** — hash + subject
- **file-created / file-edited / file-deleted** — the path
- **command** — notable commands you run
- **build** — build/test invocations and their result
- **package** — dependency installs/removals
- **feature / bugfix / refactor / test / migration / note** — semantic entries added by Claude or by you

`session.json` shape (array of `ActivityEntry`):

```json
[
  {
    "time": "09:42",
    "type": "commit",
    "description": "Add PDF exporter table renderer",
    "date": "2026-07-13",
    "meta": { "hash": "a1b2c3d" }
  },
  {
    "time": "10:15",
    "type": "file-edited",
    "description": "src/services/pdfExporter.ts",
    "date": "2026-07-13"
  }
]
```

At the end of a day (or on `/worklog`), the session can be rolled into `completed.json` for history.

---

## Template engine + placeholders

Documents are assembled from Markdown templates in `templates/` using a small `{{PLACEHOLDER}}` substitution engine (a `TemplateData` map of `string → string`). Unknown placeholders are left blank rather than throwing.

Common placeholders:

| Placeholder | Meaning |
|-------------|---------|
| `{{PROJECT}}` | Project name |
| `{{DEVELOPER}}` | Developer display name |
| `{{DATE}}` | Human date, e.g. `July 13, 2026` |
| `{{SPRINT}}` | Sprint / version label |
| `{{SUBTITLE}}` | One-line summary under the title |
| `{{TASKS}}` | Rendered task rows |
| `{{GOALS}}` | Goal lines |
| `{{DELIVERABLES}}` | Deliverable lines |
| `{{CHECKLIST_ITEMS}}` | Worklog completion rows |
| `{{CHECKLIST_REF}}` | Source checklist reference |
| `{{ADDITIONAL}}` | Additional tasks completed |
| `{{NOT_COMPLETED}}` | Tasks not completed |
| `{{BLOCKERS}}` | Blockers |
| `{{NEXT}}` | Next priorities |
| `{{TIME_*}}` | Time-spent cells (planning, development, testing, bug fixes, meetings, total) |
| `{{STATUS}}` | Overall schedule status |
| `{{NOTES}}` | Notes lines |
| `{{FILE_STEM}}` | Output file stem, e.g. `CASERES_CHECKLIST_07-11-2026` |

---

## Export formats

The same in-memory `Checklist` / `Worklog` model renders to four formats via the `export` config value or a `--export` flag:

- **PDF** — the authoritative, pixel-accurate A4 layout (see `DESIGN_SPEC.md`), rendered with `pdfkit`. Fully offline.
- **Markdown** (`markdown` / `md`) — clean Markdown for pasting into issues or wikis.
- **DOCX** — a hand-rolled Office Open XML package (a zipped `word/document.xml`), openable in Word / Google Docs.
- **HTML** — self-contained styled HTML, produced from the Markdown render.

```bash
/checklist auto --export pdf
/worklog --export html
/config set export docx      # make DOCX the default
```

Output goes to `outputDir` (config) or `./dev-workflow-reports` by default.

---

## Repository scanner

The scanner produces prioritized `ScanFinding`s (`critical` / `high` / `medium` / `low`) across categories such as:

- `TODO` / `FIXME` markers
- files missing corresponding tests
- oversized files / functions
- risky patterns (leftover debug logs, hardcoded secrets-looking strings)

Findings can be pulled into `/checklist auto` as candidate tasks.

---

## Git integration

`dev-workflow` gathers a `GitContext` by shelling out to `git` (gracefully degrading when the directory is not a repo):

- current branch
- porcelain status
- changed files
- recent commits (`hash`, `subject`, `date`)
- diff stat

This context seeds `/checklist from-git`, `/status`, and enriches worklog summaries.

---

## Config file shape

`~/.claude/dev-workflow/config.json` (`DevWorkflowConfig`):

```json
{
  "backgroundTracking": true,
  "autoSave": true,
  "template": "default",
  "export": "pdf",
  "outputDir": "/home/you/Documents",
  "checklistDir": "/home/you/Documents/checklist",
  "worklogDir": "/home/you/Documents/accomplishment",
  "developer": "Roman Caseres"
}
```

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `backgroundTracking` | boolean | `true` | Record activity into `session.json`. |
| `autoSave` | boolean | `true` | Auto-persist documents after rendering. |
| `template` | string | `"default"` | Named layout template. |
| `export` | `pdf` \| `markdown` \| `md` \| `docx` \| `html` | `"pdf"` | Default export format. |
| `outputDir` | string (absolute) | `~/Documents` (else `./dev-workflow-reports`) | Base directory where reports are written. |
| `checklistDir` | string (absolute) | falls back to `outputDir` | Override folder for checklists. |
| `worklogDir` | string (absolute) | falls back to `outputDir` | Override folder for worklogs. |
| `developer` | string | — | Name used in report headers. |

**Choosing where docs are saved.** The installer asks where to save reports (and
whether checklists and worklogs go in separate folders). Change it anytime:

```bash
dev-workflow config set outputDir    ~/Documents
dev-workflow config set checklistDir ~/Documents/checklist
dev-workflow config set worklogDir   ~/Documents/accomplishment
# or run the interactive editor:
dev-workflow config
```

Per command, `--out <dir>` overrides the configured location for that run.

---

## Architecture & adding a future command

The extension is layered:

1. **`src/types.ts`** — the shared contract. Every service and command builds against these interfaces.
2. **`src/config.ts`** — config + storage path resolution (`configDir`, `storageDir`, `loadConfig`, `saveConfig`, `resolveOutputDir`).
3. **`src/services/`** — stateless building blocks: `tracker`, `gitContext`, `repoScanner`, `templateEngine`, and the four exporters (`pdfExporter`, `mdExporter`, `docxExporter`, `htmlExporter`).
4. **`src/commands/`** — one module per slash command; it gathers input, builds a `Checklist` / `Worklog`, and calls an exporter.
5. **`bin/cli.js` + `commands/`** — the CLI entry and the Claude Code command registrations.

### To add a future command (e.g. `/standup`, `/sprint`, `/release`, `/changelog`, `/report`, `/audit`, `/spec`, `/performance`, `/review`)

1. Add any new document model to `src/types.ts` (extend, don't mutate meaning — add optional fields).
2. Create `src/commands/<name>.ts` that assembles the model from services (git, tracker, scanner) and renders via an exporter.
3. Register a Markdown template in `templates/<name>.md` with `{{PLACEHOLDERS}}`.
4. Add a command definition under `commands/<name>.md` (Claude Code slash-command file) and wire it in `bin/cli.js`.
5. Reuse `resolveOutputDir(cfg)` for output and the shared exporter interface — do not reimplement rendering.

The roadmap commands map cleanly onto this pattern: `/standup` (daily summary from session), `/sprint` (multi-day rollup), `/release` & `/changelog` (from git tags/commits), `/report` (arbitrary range), `/audit` & `/review` (repo scanner), `/spec` (template-driven doc), `/performance` (time-allocation analytics).

---

## Contributing

1. Fork and clone.
2. `npm install`
3. `npm run dev` (TypeScript watch) while you work.
4. Keep the runtime dependency set to `pdfkit` only — hand-roll everything else.
5. Match the visual contract in `DESIGN_SPEC.md` for any renderer change.
6. Run `npm run build` and confirm a clean `tsc` before opening a PR.

---

## License

MIT © 2026 Roman Caseres. See [LICENSE](./LICENSE).
