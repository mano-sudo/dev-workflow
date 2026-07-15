/**
 * dev-workflow — shared type contract.
 *
 * Every service and command builds against these interfaces. Do not change a
 * field's meaning without updating all consumers; add optional fields instead.
 */

/** Export formats supported by the PDF/report exporter. */
export type ExportFormat = "pdf" | "markdown" | "md" | "docx" | "html";

/** Named layout template. Currently only "default" ships. */
export type TemplateName = "default" | string;

/** Persisted user configuration (~/.claude/dev-workflow/config.json). */
export interface DevWorkflowConfig {
  backgroundTracking: boolean;
  autoSave: boolean;
  template: TemplateName;
  export: ExportFormat;
  /** Base directory where generated reports are written. Absolute path. */
  outputDir?: string;
  /** Override directory for Development Checklists. Falls back to outputDir. */
  checklistDir?: string;
  /** Override directory for Development Worklogs. Falls back to outputDir. */
  worklogDir?: string;
  /** Developer display name used in report headers. */
  developer?: string;
}

export const DEFAULT_CONFIG: DevWorkflowConfig = {
  backgroundTracking: true,
  autoSave: true,
  template: "default",
  export: "pdf",
};

/** Task priority in a checklist. */
export type Priority = "High" | "Medium" | "Low";

/** Lifecycle state of a checklist task. */
export type TaskStatus =
  | "Not Started"
  | "In Progress"
  | "Completed"
  | "On Hold"
  | "Cancelled";

/** A single planned task line in a Development Checklist. */
export interface ChecklistTask {
  status: TaskStatus;
  priority: Priority;
  task: string;
  notes?: string;
}

/** A fully-populated Development Checklist, ready for rendering. */
export interface Checklist {
  project: string;
  developer: string;
  /** Human date, e.g. "July 11, 2026". */
  date: string;
  sprint: string;
  /** One-line summary printed under the title. */
  subtitle?: string;
  tasks: ChecklistTask[];
  goals: string[];
  deliverables: string[];
}

/** Completion state of a worklog checklist line. */
export type WorklogTaskStatus = "Completed" | "Partial" | "Not Done";

/** A row in the worklog "Checklist Completion" table. */
export interface WorklogChecklistItem {
  task: string;
  status: WorklogTaskStatus;
  result?: string;
}

/** Overall schedule status for a worklog. */
export type ScheduleStatus = "On Schedule" | "Slight Delay" | "Delayed";

/** Time allocation for the worklog "Time Spent" grid (hours). */
export interface TimeAllocation {
  planning?: number;
  development?: number;
  testing?: number;
  bugFixes?: number;
  meetings?: number;
  total?: number;
}

/** A fully-populated Development Worklog, ready for rendering. */
export interface Worklog {
  project: string;
  developer: string;
  date: string;
  sprint: string;
  subtitle?: string;
  checklistItems: WorklogChecklistItem[];
  /** Reference to the source checklist, e.g. "CASERES_CHECKLIST_07-11-2026". */
  checklistRef?: string;
  /** Beyond-checklist work, rendered as a task/status/result table. */
  additional: WorklogChecklistItem[];
  notCompleted: string[];
  blockers: string[];
  next: string[];
  time: TimeAllocation;
  status: ScheduleStatus;
  notes: string[];
  summary?: string;
}

/** Category for a background-tracked activity entry. */
export type ActivityType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "build"
  | "commit"
  | "command"
  | "package"
  | "migration"
  | "file-created"
  | "file-edited"
  | "file-deleted"
  | "note";

/** A single tracked activity written to storage/session.json. */
export interface ActivityEntry {
  /** "HH:MM" 24h local time. */
  time: string;
  type: ActivityType;
  description: string;
  /** ISO date "YYYY-MM-DD" this entry belongs to. */
  date?: string;
  /** Optional real-world outcome ("what happened"), shown in the Result column. */
  result?: string;
  /** Optional structured detail (file path, commit hash, etc.). */
  meta?: Record<string, unknown>;
}

/** Git snapshot used as report context. */
export interface GitContext {
  isRepo: boolean;
  branch?: string;
  status?: string;
  changedFiles?: string[];
  recentCommits?: { hash: string; subject: string; date: string }[];
  diffStat?: string;
}

/** Priority of a repository-scanner finding. */
export type FindingPriority = "critical" | "high" | "medium" | "low";

/** A single finding from the repository scanner. */
export interface ScanFinding {
  priority: FindingPriority;
  category: string;
  file?: string;
  line?: number;
  message: string;
}

/** Placeholder map consumed by the template engine. */
export type TemplateData = Record<string, string>;
