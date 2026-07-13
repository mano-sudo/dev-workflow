---
description: View or change dev-workflow settings (background tracking, auto-save, template, export format, output directory, developer name).
---

Help the developer view or update their dev-workflow configuration stored at
`~/.claude/dev-workflow/config.json`.

Arguments passed: `$ARGUMENTS`

## View current settings

```
npx dev-workflow config $ARGUMENTS
```

Fallback: `node bin/cli.js config`.

## Change a setting

Pass `key=value` pairs. Supported keys:

- `backgroundTracking` — `true` / `false`
- `autoSave` — `true` / `false`
- `template` — a template name (default: `default`)
- `export` — `pdf` | `markdown` | `md` | `docx` | `html`
- `outputDir` — absolute path where reports are written
- `developer` — display name used in report headers

Examples:

```
npx dev-workflow config export=markdown
npx dev-workflow config backgroundTracking=false developer="Roman Caseres"
```

## Present results

After viewing or updating, show the resulting configuration as a readable list and
confirm what changed. If the developer asks for something that is not a valid key or
value, explain the accepted options rather than guessing.
