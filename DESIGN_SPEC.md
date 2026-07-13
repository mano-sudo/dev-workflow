# PDF Design Spec — Development Checklist & Worklog

This is the authoritative visual contract for `src/services/pdfExporter.ts`.
It is derived pixel-by-pixel from the reference reports
`CASERES_CHECKLIST_07-11-2026.pdf` and `CASERES_WORKLOG_07-11-2026.pdf`.
Reproduce this **exactly**. Use `pdfkit` (already a dependency). Offline, no
Chromium.

## Page

- Size: **A4** portrait (595.28 × 841.89 pt).
- Margins: **54 pt** all sides (content width ≈ 487 pt).
- Base font: Helvetica family (pdfkit built-in). `Helvetica`, `Helvetica-Bold`,
  `Helvetica-Oblique`. Monospace for inline code: `Courier`.
- Auto-paginate: when the y-cursor passes the bottom margin, `addPage()` and
  reset. A shared helper `ensureSpace(doc, needed)` must guard every block.

## Color tokens

| token        | hex       | use                                        |
|--------------|-----------|--------------------------------------------|
| ink          | `#1a1a1a` | titles, primary text                       |
| body         | `#333333` | body text                                  |
| muted        | `#6b7280` | helper text, labels, footer                |
| faint        | `#9ca3af` | placeholder text, empty-state              |
| rule         | `#e5e7eb` | hairline separators, table borders         |
| panelBg      | `#f3f4f6` | "HOW TO USE" callout background            |
| accentBar    | `#374151` | left accent bar on callout                 |
| high         | `#dc2626` | priority High                              |
| medium       | `#ea580c` | priority Medium                            |
| low          | `#0891b2` | priority Low                               |
| doneGreen    | `#059669` | Completed text / check                     |
| doneBg       | `#ecfdf5` | Completed pill background                  |
| codeBg       | `#f3f4f6` | inline code background                     |
| amber        | `#f59e0b` | "Slight Delay" dot                         |
| red          | `#ef4444` | "Delayed" dot                              |

## Shared building blocks (implement once, reuse in both docs)

1. **Title block** — `Helvetica-Bold ~26pt` ink, left-aligned. Immediately
   below: a **2pt** ink horizontal rule across content width. Then a subtitle
   line in `muted 9.5pt` (wraps).
2. **"HOW TO USE THIS PAGE" callout** — rounded rect (`radius 3`) filled
   `panelBg`, with a **3pt** `accentBar` vertical bar flush on its left edge.
   Heading: `Helvetica-Bold 7.5pt` `accentBar`, uppercase, letter-spaced
   (`characterSpacing: 0.8`). Body: numbered lines `8.5pt body`, ~13pt leading.
3. **Meta grid** — two columns (each ≈ 50% width). Row 1: PROJECT | DEVELOPER.
   Row 2: DATE | SPRINT / VERSION. Each cell: label `7.5pt muted` uppercase
   letter-spaced, value `10.5pt Helvetica-Bold ink` on the next line, then a
   `rule` hairline under the value spanning the column.
4. **Section header** — `Helvetica-Bold 11pt` ink, uppercase text as given,
   followed by a `rule` hairline across content width. ~6pt gap after.
5. **Section caption** — optional `muted 8.5pt` italic-ish helper line directly
   under a section header (e.g. "What should be true by the end?").
6. **Inline code** — render tokens wrapped in backticks (or explicitly flagged)
   in `Courier 8.5pt` with a `codeBg` rounded highlight behind them. A simple
   run-parser splitting on backticks is enough.
7. **Footer** — on every page, centered at the bottom margin: `muted 8pt`
   `"<Doc Title> · <subtitle-ish> · <FILE_STEM>"`. E.g.
   `Development Checklist · Gaps vs … (full audit) · CASERES_CHECKLIST_07-11-2026`.

## Tables

- Outer rounded border (`radius 4`) in `rule`, 1pt.
- Header row: `panelBg` fill, labels `7.5pt Helvetica-Bold muted` uppercase
  letter-spaced.
- Body rows: white; a `rule` hairline separates rows. Cell padding ~7pt.
  Row height grows to fit wrapped text (measure with `doc.heightOfString`).
- Column widths are per-table (below).

## DOCUMENT 1 — Development Checklist

Order top to bottom:

1. Title `Development Checklist` + rule + subtitle.
2. HOW TO USE callout (4 numbered lines — see templates/checklist.md).
3. Meta grid (project / developer / date / sprint).
4. Section header `PLANNED TASKS` + caption.
5. **Tasks table**, columns:
   - `STATUS` (~46pt) — an empty rounded-square checkbox glyph (`☐`, 10pt,
     stroke `#9ca3af`, ~11pt square, radius 2), centered.
   - `PRIORITY` (~62pt) — the word colored by token (High/Medium/Low),
     `Helvetica-Bold 9pt`.
   - `TASK` (~150pt) — `Helvetica-Bold 9pt ink`.
   - `NOTES` (remaining) — `8.5pt body`, inline-code aware, wraps.
6. **Legend row** (below table, no border): five chips left-to-right —
   `☐ Not Started`, `● In Progress` (amber dot), `✓ Completed` (green check in
   a box), `■ On Hold` (blue square), `● Cancelled` (red dot). Labels `8pt body`.
7. Section header `GOALS` + caption "What should be true by the end? Outcomes,
   not tasks." → each goal on its own line separated by a `rule` hairline,
   `9pt body`.
8. Section header `EXPECTED DELIVERABLES` + caption "The finished things to hand
   over." → same line-with-hairline treatment.
9. Footer.

## DOCUMENT 2 — Development Worklog

Order top to bottom:

1. Title `Development Worklog` + rule + subtitle.
2. HOW TO USE callout (4 numbered lines — see templates/worklog.md).
3. Meta grid.
4. Section header `1. CHECKLIST COMPLETION` + caption (references the source
   checklist, e.g. "Every development gap from CASERES_CHECKLIST_07-11-2026.").
5. **Checklist-completion table**, columns:
   - `PLANNED TASK` (~230pt) — `Helvetica-Bold 9pt ink`.
   - `STATUS` (~90pt) — a pill: rounded rect `doneBg`, text `✓ Completed`
     `doneGreen 8.5pt Bold`. For Partial use amber tones, Not Done use red tones.
   - `RESULT` (remaining) — `8.5pt body`, inline-code aware.
6. Section header `2. ADDITIONAL TASKS COMPLETED` + caption → list of lines,
   each separated by a `rule` hairline, `8.5pt body`.
7. Section header `3. SUMMARY OF WORK COMPLETED` → a **stat row**: up to four
   stat cells side by side. Each: big number `Helvetica-Bold ~26pt ink`
   (e.g. `13`, with a smaller `/ 13` after it in `faint`), a `rule` hairline
   under, then a `7.5pt muted` uppercase label (`GAP TASKS COMPLETED`,
   `PARTIALLY DONE`, `ADDITIONAL (…)`, `OVERALL PROGRESS` → `100%`).
8. Section header `4. TASKS NOT COMPLETED` + line(s), or the empty-state text.
9. Two-column block: left `5. BLOCKERS`, right `6. NEXT PRIORITIES`. Each is a
   section header within its column, caption, then hairline-separated lines.
   Next priorities are numbered (`1.` `2.` …) with the numeral in `muted`.
10. Section header `7. TIME SPENT` + caption "Roughly how the day went.
    Estimates are fine." → a 2-column × 3-row grid of small stat cells:
    PLANNING / AUDIT, DEVELOPMENT, TESTING, BUG FIXES, MEETINGS, TOTAL HOURS.
    Label `7.5pt muted` uppercase, value `10.5pt Helvetica-Bold` (e.g. `2.0 h`),
    `rule` hairline under each.
11. Section header `8. OVERALL STATUS` + caption "Tick one." → one row with
    three options: `☑/☐ ● On Schedule` (green dot), `☐ ● Slight Delay` (amber),
    `☐ ● Delayed` (red). The selected one shows a green-check box; others empty.
12. Section header `9. NOTES` → hairline-separated note lines.
13. Footer.

## BLANK variant (`blank: true`)

The extension must be able to render a **blank** version of each document with
the **identical design and structure**, but no real content:

- Meta grid values → blank (leave the value line empty above the hairline; still
  show labels PROJECT / DEVELOPER / DATE / SPRINT / VERSION).
- Subtitle → a faint placeholder or empty.
- Tables → render **8 empty rows** (checklist) / **6 empty rows** (worklog) with
  empty cells and, for the checklist, an empty checkbox in every STATUS cell.
- Legend, section headers, captions, callout, time-grid labels, status options,
  stat labels → **all still shown** (structure must be visible).
- Stat numbers / time values → blank (show label + hairline only).
- Overall status → all three options shown, none ticked.
- Goals / Deliverables / Additional / Blockers / Next / Notes → render 3 empty
  hairline rows each so the reader sees where content goes.

The blank output is what a fresh user gets before filling anything in — it is a
printable paper form that mirrors the filled report exactly.
