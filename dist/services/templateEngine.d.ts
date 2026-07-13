import { Checklist, Worklog, TemplateData } from "../types";
/**
 * Read templates/<kind>.md relative to the installed package.
 * `name` selects a named variant (defaults to "default"); only "default" ships,
 * so any other name falls back to the base <kind>.md file.
 */
export declare function loadTemplate(kind: "checklist" | "worklog", name?: string): string;
/**
 * Replace every {{key}} token with data[key]. Missing/unknown keys become "".
 * Literal text (including single braces) is left untouched.
 */
export declare function render(template: string, data: TemplateData): string;
/** Convert a Checklist into the placeholder map the template expects. */
export declare function checklistToTemplateData(c: Checklist): TemplateData;
/** Convert a Worklog into the placeholder map the template expects. */
export declare function worklogToTemplateData(w: Worklog): TemplateData;
/**
 * Minimal but correct Markdown -> HTML: headings, bold/italic/inline-code,
 * pipe tables, ordered/unordered lists, HTML comments (dropped), and
 * paragraphs. Wrapped in a styled document approximating the report look.
 */
export declare function toHTML(markdown: string): string;
