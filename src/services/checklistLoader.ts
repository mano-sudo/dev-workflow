/**
 * checklistLoader — read the planned tasks out of an existing checklist so a
 * worklog can be reconciled against it.
 *
 * Resolution order for a given path:
 *   1. a structured sidecar `<name>.json` next to the file (written by the
 *      checklist command) — perfect fidelity;
 *   2. a `.json` file passed directly;
 *   3. `.md` / `.html` / `.txt` — parse the task table;
 *   4. `.pdf` — extract text with pdf-parse and parse task lines heuristically.
 */
import * as fs from "fs";
import * as path from "path";
import { Checklist, ChecklistTask, Priority } from "../types";

export interface LoadedChecklist {
  stem: string;
  project?: string;
  developer?: string;
  sprint?: string;
  tasks: ChecklistTask[];
}

function normPriority(v: string): Priority {
  const s = (v || "").trim().toLowerCase();
  if (s.startsWith("h")) return "High";
  if (s.startsWith("l")) return "Low";
  return "Medium";
}

function fromChecklistObject(c: Partial<Checklist>, stem: string): LoadedChecklist {
  const tasks: ChecklistTask[] = Array.isArray(c.tasks)
    ? c.tasks
        .filter((t) => t && typeof t.task === "string" && t.task.trim())
        .map((t) => ({
          status: t.status || "Not Started",
          priority: normPriority(String(t.priority || "Medium")),
          task: t.task.trim(),
          notes: t.notes,
        }))
    : [];
  return {
    stem,
    project: c.project,
    developer: c.developer,
    sprint: c.sprint,
    tasks,
  };
}

/** Parse the pipe-table task rows out of a rendered markdown checklist. */
function parseMarkdownTasks(md: string): ChecklistTask[] {
  const tasks: ChecklistTask[] = [];
  const statuses = ["not started", "in progress", "completed", "on hold", "cancelled"];
  const priorities = ["high", "medium", "low"];
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 3) continue;
    const lower = cells.map((c) => c.toLowerCase());
    // header / separator rows
    if (lower.some((c) => c.includes("task")) && lower.some((c) => c.includes("priority"))) {
      continue;
    }
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;

    // Find the priority column; the task is the next non-priority-ish cell.
    const pIdx = lower.findIndex((c) => priorities.includes(c));
    let priority: Priority = "Medium";
    let taskText = "";
    let notes: string | undefined;
    if (pIdx >= 0) {
      priority = normPriority(cells[pIdx]);
      const rest = cells.slice(pIdx + 1).filter((c) => !statuses.includes(c.toLowerCase()));
      taskText = rest[0] || "";
      notes = rest[1];
    } else {
      // No priority cell: drop a leading status cell, take the next as task.
      const rest = cells.filter((c) => !statuses.includes(c.toLowerCase()));
      taskText = rest[0] || "";
      notes = rest[1];
    }
    if (taskText && !/^task$/i.test(taskText)) {
      tasks.push({ status: "Not Started", priority, task: taskText, notes });
    }
  }
  return tasks;
}

/** Heuristically pull task lines out of extracted checklist PDF text. */
function parsePdfText(text: string): ChecklistTask[] {
  const tasks: ChecklistTask[] = [];
  const lines = text.split(/\r?\n/);
  let inTasks = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^PLANNED TASKS/i.test(line)) {
      inTasks = true;
      continue;
    }
    if (/^(GOALS|EXPECTED DELIVERABLES)\b/i.test(line)) {
      inTasks = false;
    }
    if (!inTasks) continue;
    // Rows begin with a priority word, optionally followed by a tab/space and text.
    const m = line.match(/^(High|Medium|Low)\b[\s\t]*(.+)$/i);
    if (m && m[2] && m[2].length > 2) {
      // Trim trailing notes fragments after a long run; keep the task phrase.
      const task = m[2].replace(/\s{2,}.*$/, "").trim();
      if (task) {
        tasks.push({ status: "Not Started", priority: normPriority(m[1]), task });
      }
    }
  }
  return tasks;
}

async function extractPdfText(file: string): Promise<string> {
  // Lazy, defensive: pdf-parse is optional at runtime.
  let mod: any;
  try {
    mod = require("pdf-parse");
  } catch {
    throw new Error(
      "Reading a PDF checklist needs the 'pdf-parse' package. Install it (npm i pdf-parse) " +
        "or paste the checklist's .md file / regenerate the checklist."
    );
  }
  const buf = fs.readFileSync(file);
  const PDFParse = mod.PDFParse || mod.default?.PDFParse;
  if (PDFParse) {
    const parser = new PDFParse({ data: buf });
    try {
      const res = await parser.getText();
      return String(res?.text ?? res ?? "");
    } finally {
      if (typeof parser.destroy === "function") await parser.destroy();
    }
  }
  // Fall back to the v1 callable API.
  const fn = typeof mod === "function" ? mod : mod.default;
  if (typeof fn === "function") {
    const res = await fn(buf);
    return String(res?.text ?? "");
  }
  throw new Error("Unsupported pdf-parse version.");
}

/** Load planned tasks from a checklist file (json / md / html / pdf). */
export async function loadChecklistFromFile(file: string): Promise<LoadedChecklist> {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`Checklist file not found: ${abs}`);
  }
  const ext = path.extname(abs).toLowerCase();
  const stem = path.basename(abs, ext);

  // 1. Structured sidecar next to the file (perfect fidelity).
  const sidecar = path.join(path.dirname(abs), `${stem}.json`);
  if (ext !== ".json" && fs.existsSync(sidecar)) {
    try {
      const obj = JSON.parse(fs.readFileSync(sidecar, "utf8"));
      return fromChecklistObject(obj, stem);
    } catch {
      /* fall through to direct parsing */
    }
  }

  if (ext === ".json") {
    const obj = JSON.parse(fs.readFileSync(abs, "utf8"));
    return fromChecklistObject(obj, stem);
  }

  if (ext === ".md" || ext === ".markdown" || ext === ".html" || ext === ".txt") {
    const text = fs.readFileSync(abs, "utf8");
    return { stem, tasks: parseMarkdownTasks(text) };
  }

  if (ext === ".pdf") {
    const text = await extractPdfText(abs);
    return { stem, tasks: parsePdfText(text) };
  }

  throw new Error(`Unsupported checklist format: ${ext || "(no extension)"}`);
}
