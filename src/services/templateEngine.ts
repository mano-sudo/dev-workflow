/**
 * dev-workflow — template engine.
 *
 * Loads Markdown layout templates (templates/<kind>.md), fills {{placeholder}}
 * tokens from a TemplateData map, converts Checklist/Worklog domain objects into
 * that map (rendering tables/lists as Markdown), and provides a minimal but
 * correct Markdown -> styled HTML converter used by the HTML exporter.
 *
 * No external runtime dependencies beyond Node built-ins.
 */
import * as fs from "fs";
import * as path from "path";
import { configDir } from "../config";
import {
  Checklist,
  Worklog,
  TemplateData,
  ChecklistTask,
  WorklogChecklistItem,
} from "../types";

/* ------------------------------------------------------------------ */
/* Template resolution + loading                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve the directory that holds the shipped Markdown templates.
 * Primary: package root relative to this compiled file (dist/services -> ../../templates).
 * Fallbacks handle running from src and an installed copy under the config dir.
 */
function templatesDir(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "templates"),
    path.join(__dirname, "..", "templates"),
    path.join(configDir(), "templates"),
    path.join(process.cwd(), "templates"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return dir;
      }
    } catch {
      /* ignore and try next */
    }
  }
  // Default to the package-root guess even if it does not exist so the error
  // message from loadTemplate points somewhere sensible.
  return candidates[0];
}

/**
 * Read templates/<kind>.md relative to the installed package.
 * `name` selects a named variant (defaults to "default"); only "default" ships,
 * so any other name falls back to the base <kind>.md file.
 */
export function loadTemplate(
  kind: "checklist" | "worklog",
  name?: string,
): string {
  const dir = templatesDir();
  const variant = name && name !== "default" ? name : undefined;
  const tried: string[] = [];

  const files: string[] = [];
  if (variant) {
    files.push(path.join(dir, `${kind}.${variant}.md`));
    files.push(path.join(dir, variant, `${kind}.md`));
  }
  files.push(path.join(dir, `${kind}.md`));

  for (const file of files) {
    tried.push(file);
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `templateEngine: could not load ${kind} template (tried: ${tried.join(", ")})`,
  );
}

/* ------------------------------------------------------------------ */
/* Placeholder rendering                                               */
/* ------------------------------------------------------------------ */

/**
 * Replace every {{key}} token with data[key]. Missing/unknown keys become "".
 * Literal text (including single braces) is left untouched.
 */
export function render(template: string, data: TemplateData): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

/* ------------------------------------------------------------------ */
/* Domain -> TemplateData                                              */
/* ------------------------------------------------------------------ */

function escapeCell(text: string): string {
  return String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function bulletList(items: string[] | undefined, emptyText: string): string {
  const clean = (items || []).map((i) => String(i).trim()).filter(Boolean);
  if (clean.length === 0) return `_${emptyText}_`;
  return clean.map((i) => `- ${i}`).join("\n");
}

function numberedList(items: string[] | undefined, emptyText: string): string {
  const clean = (items || []).map((i) => String(i).trim()).filter(Boolean);
  if (clean.length === 0) return `_${emptyText}_`;
  return clean.map((i, idx) => `${idx + 1}. ${i}`).join("\n");
}

function checklistTaskRow(t: ChecklistTask): string {
  return `| ${escapeCell(t.status)} | ${escapeCell(t.priority)} | ${escapeCell(
    t.task,
  )} | ${escapeCell(t.notes || "")} |`;
}

/** Convert a Checklist into the placeholder map the template expects. */
export function checklistToTemplateData(c: Checklist): TemplateData {
  const header = "| STATUS | PRIORITY | TASK | NOTES |";
  const divider = "| --- | --- | --- | --- |";
  const rows =
    c.tasks && c.tasks.length > 0
      ? c.tasks.map(checklistTaskRow).join("\n")
      : "| | | _No tasks planned._ | |";
  const tasks = [header, divider, rows].join("\n");

  return {
    project: c.project || "",
    developer: c.developer || "",
    date: c.date || "",
    version: c.sprint || "",
    subtitle: c.subtitle || "",
    tasks,
    goals: bulletList(c.goals, "No goals recorded."),
    deliverables: bulletList(c.deliverables, "No deliverables recorded."),
  };
}

function worklogCompletionRow(i: WorklogChecklistItem): string {
  return `| ${escapeCell(i.task)} | ${escapeCell(i.status)} | ${escapeCell(
    i.result || "",
  )} |`;
}

function summaryFromWorklog(w: Worklog): string {
  if (w.summary && w.summary.trim()) return w.summary.trim();
  const items = w.checklistItems || [];
  const total = items.length;
  const completed = items.filter((i) => i.status === "Completed").length;
  const partial = items.filter((i) => i.status === "Partial").length;
  const additional = (w.additional || []).filter((a) => a.trim()).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return [
    `- **${completed} / ${total}** gap tasks completed`,
    `- **${partial}** partially done`,
    `- **${additional}** additional tasks completed`,
    `- **${pct}%** overall progress`,
  ].join("\n");
}

function timeGrid(w: Worklog): string {
  const t = w.time || {};
  const fmt = (n?: number): string =>
    n === undefined || n === null || Number.isNaN(n) ? "—" : `${n.toFixed(1)} h`;
  const header = "| Category | Hours |";
  const divider = "| --- | --- |";
  const rows = [
    `| PLANNING / AUDIT | ${fmt(t.planning)} |`,
    `| DEVELOPMENT | ${fmt(t.development)} |`,
    `| TESTING | ${fmt(t.testing)} |`,
    `| BUG FIXES | ${fmt(t.bugFixes)} |`,
    `| MEETINGS | ${fmt(t.meetings)} |`,
    `| TOTAL HOURS | ${fmt(t.total)} |`,
  ].join("\n");
  return [header, divider, rows].join("\n");
}

function statusBlock(w: Worklog): string {
  const options: Array<Worklog["status"]> = [
    "On Schedule",
    "Slight Delay",
    "Delayed",
  ];
  return options
    .map((opt) => `- ${w.status === opt ? "☑" : "☐"} ${opt}`)
    .join("\n");
}

/** Convert a Worklog into the placeholder map the template expects. */
export function worklogToTemplateData(w: Worklog): TemplateData {
  const header = "| PLANNED TASK | STATUS | RESULT |";
  const divider = "| --- | --- | --- |";
  const rows =
    w.checklistItems && w.checklistItems.length > 0
      ? w.checklistItems.map(worklogCompletionRow).join("\n")
      : "| _No checklist items._ | | |";
  const completed = [header, divider, rows].join("\n");

  return {
    project: w.project || "",
    developer: w.developer || "",
    date: w.date || "",
    version: w.sprint || "",
    subtitle: w.subtitle || "",
    completed,
    additional: bulletList(w.additional, "None — everything was planned."),
    summary: summaryFromWorklog(w),
    notCompleted: bulletList(w.notCompleted, "Nothing outstanding."),
    blockers: bulletList(w.blockers, "No blockers."),
    next: numberedList(w.next, "Nothing queued."),
    time: timeGrid(w),
    status: statusBlock(w),
    notes: bulletList(w.notes, "No additional notes."),
    checklistRef: w.checklistRef || "",
  };
}

/* ------------------------------------------------------------------ */
/* Markdown -> HTML                                                    */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline formatting: code, bold, and italic runs. Input is pre-escaped. */
function renderInline(text: string): string {
  let out = text;
  // inline code first so its contents are not re-formatted
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return ` ${codes.length - 1} `;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, "$1<em>$2</em>");
  out = out.replace(/ (\d+) /g, (_m, i: string) => codes[Number(i)]);
  return out;
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  // split on unescaped pipes
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < l.length; i++) {
    if (l[i] === "\\" && l[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (l[i] === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += l[i];
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Minimal but correct Markdown -> HTML: headings, bold/italic/inline-code,
 * pipe tables, ordered/unordered lists, HTML comments (dropped), and
 * paragraphs. Wrapped in a styled document approximating the report look.
 */
export function toHTML(markdown: string): string {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];

  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(escapeHtml(paragraph.join(" ")))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // HTML comments (e.g. the HOW TO USE marker) — drop the whole comment.
    if (/^<!--/.test(trimmed)) {
      flushParagraph();
      closeList();
      while (i < lines.length && !/-->/.test(lines[i])) i++;
      continue;
    }

    // blank line
    if (trimmed === "") {
      flushParagraph();
      closeList();
      continue;
    }

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(
        `<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`,
      );
      continue;
    }

    // table: current line has a pipe and the next line is a divider
    if (trimmed.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushParagraph();
      closeList();
      const headerCells = splitRow(trimmed);
      i += 2; // skip header + divider
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        if (isTableDivider(lines[i])) {
          i++;
          continue;
        }
        bodyRows.push(splitRow(lines[i].trim()));
        i++;
      }
      i--; // step back; outer loop will advance
      const thead = headerCells
        .map((c) => `<th>${renderInline(escapeHtml(c))}</th>`)
        .join("");
      const tbody = bodyRows
        .map(
          (row) =>
            `<tr>${row
              .map((c) => `<td>${renderInline(escapeHtml(c))}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      html.push(
        `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`,
      );
      continue;
    }

    // ordered list
    const ol = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(escapeHtml(ol[2].trim()))}</li>`);
      continue;
    }

    // unordered list
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(escapeHtml(ul[1].trim()))}</li>`);
      continue;
    }

    // otherwise part of a paragraph
    closeList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  closeList();

  const body = html.join("\n");
  return wrapHtmlDocument(body);
}

const HTML_CSS = `
:root {
  --ink: #1a1a1a; --body: #333333; --muted: #6b7280; --faint: #9ca3af;
  --rule: #e5e7eb; --panelBg: #f3f4f6; --accent: #374151; --codeBg: #f3f4f6;
}
* { box-sizing: border-box; }
body {
  font-family: Helvetica, Arial, sans-serif; color: var(--body);
  max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.5;
  font-size: 14px; background: #ffffff;
}
h1 {
  font-size: 28px; color: var(--ink); font-weight: 700; margin: 0 0 8px;
  padding-bottom: 10px; border-bottom: 2px solid var(--ink);
}
h2 {
  font-size: 15px; color: var(--ink); font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.3px; margin: 28px 0 6px; padding-bottom: 5px;
  border-bottom: 1px solid var(--rule);
}
h3, h4, h5, h6 { color: var(--ink); font-weight: 700; margin: 18px 0 6px; }
p { margin: 8px 0; }
p em, li em { color: var(--muted); font-style: italic; }
a { color: var(--accent); }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 4px 0; }
code {
  font-family: "Courier New", Courier, monospace; font-size: 0.88em;
  background: var(--codeBg); padding: 1px 5px; border-radius: 3px; color: var(--ink);
}
table {
  border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px;
  border: 1px solid var(--rule); border-radius: 4px; overflow: hidden;
}
thead th {
  background: var(--panelBg); color: var(--muted); text-align: left;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
  padding: 8px 9px; font-weight: 700;
}
tbody td { padding: 7px 9px; border-top: 1px solid var(--rule); vertical-align: top; }
strong { color: var(--ink); }
footer {
  margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--rule);
  color: var(--muted); font-size: 11px; text-align: center;
}
`.trim();

function wrapHtmlDocument(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dev-workflow report</title>
<style>
${HTML_CSS}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
