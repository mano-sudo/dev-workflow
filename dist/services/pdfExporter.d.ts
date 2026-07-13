import { Checklist, Worklog } from "../types";
export declare function renderChecklistPDF(data: Checklist, outPath: string, opts?: {
    blank?: boolean;
    footerNote?: string;
}): Promise<string>;
export declare function renderWorklogPDF(data: Worklog, outPath: string, opts?: {
    blank?: boolean;
    footerNote?: string;
}): Promise<string>;
