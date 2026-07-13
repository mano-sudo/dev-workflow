# Installing dev-workflow

This guide covers installing the `dev-workflow` Claude Code extension, verifying
it works, enabling or disabling background tracking later, troubleshooting, and
uninstalling.

---

## 1. Prerequisites

- **Node.js >= 18** — check with:
  ```bash
  node --version
  ```
- **npm** (ships with Node).
- **Claude Code** installed and working.
- A terminal with write access to your home directory (config lives under
  `~/.claude/dev-workflow/`).

The only runtime dependency pulled in is `pdfkit`; everything else is Node
built-ins.

---

## 2. Install

### Option A — one command (recommended)

```bash
npx dev-workflow install
```

### Option B — global install

```bash
npm install -g dev-workflow
dev-workflow install
```

### Option C — from source

```bash
git clone https://github.com/romancaseres/dev-workflow.git
cd dev-workflow
npm install
npm run build
node bin/cli.js install
```

---

## 3. What the installer does

`dev-workflow install` performs these steps, each idempotent (safe to re-run):

1. **Builds** the TypeScript into `dist/` if a build is not already present
   (`npm run build`).
2. **Creates** the config + storage tree at `~/.claude/dev-workflow/`:
   - `config.json` (written from `DEFAULT_CONFIG` if missing)
   - `storage/session.json` (seeded as `[]`)
   - `storage/completed.json` (seeded as `[]`)
3. **Registers** the slash commands (`/checklist`, `/worklog`, `/status`,
   `/history`, `/config`) with Claude Code by copying the command definitions.
4. **Runs the first-run prompt** asking whether to enable background tracking,
   and saves your answer to `config.json`.

It does **not** send anything off your machine.

---

## 4. Verify the installation

```bash
# 1. The CLI resolves:
dev-workflow --version

# 2. Config + storage exist:
ls ~/.claude/dev-workflow
ls ~/.claude/dev-workflow/storage      # session.json  completed.json

# 3. Print current config:
dev-workflow config          # or /config inside Claude Code

# 4. Render a blank checklist as a smoke test:
dev-workflow checklist blank
```

Inside Claude Code, type `/checklist blank` — a PDF (or your configured format)
should appear in your output directory (`./dev-workflow-reports` by default).

---

## 5. Enable or disable background tracking later

Background tracking is **on by default**. Change it any time:

```bash
# Disable
dev-workflow config set backgroundTracking false
#   or inside Claude Code:
/config set backgroundTracking false

# Re-enable
dev-workflow config set backgroundTracking true
```

The setting is persisted to `~/.claude/dev-workflow/config.json`. When disabled,
no new `ActivityEntry` records are written; existing `session.json` data is kept.

To clear tracked data without disabling:

```bash
# reset today's session (empties the array)
printf '[]\n' > ~/.claude/dev-workflow/storage/session.json
```

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `command not found: dev-workflow` | Ensure global npm bin is on your `PATH` (`npm bin -g`), or use `npx dev-workflow`. |
| `Unsupported engine` / Node error | Upgrade to Node >= 18 (`node --version`). |
| Slash commands don't appear in Claude Code | Re-run `dev-workflow install`, then restart Claude Code so it re-reads command definitions. |
| PDF not generated | Confirm `pdfkit` installed (`npm ls pdfkit`); re-run `npm install`. |
| `EACCES` writing config | Check permissions on `~/.claude`; the installer needs write access there. |
| Reports written to unexpected folder | Check `outputDir`: `dev-workflow config`, then `dev-workflow config set outputDir /abs/path`. |
| Build errors from source | Run `npm install` then `npm run build`; requires TypeScript 5.4+. |
| Corrupt `session.json` | Reset it: `printf '[]\n' > ~/.claude/dev-workflow/storage/session.json`. |

---

## 7. Uninstall

```bash
# 1. Remove the global package (if installed globally)
npm uninstall -g dev-workflow

# 2. Remove config, settings and tracked data
rm -rf ~/.claude/dev-workflow

# 3. (from-source installs) delete the cloned directory
rm -rf /path/to/dev-workflow
```

After uninstalling, the `/checklist`, `/worklog`, `/status`, `/history` and
`/config` slash commands are removed from Claude Code on its next restart. Any
reports you already generated in your output directory are left untouched.
