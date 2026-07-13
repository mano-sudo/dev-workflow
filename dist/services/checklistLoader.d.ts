import { ChecklistTask } from "../types";
export interface LoadedChecklist {
    stem: string;
    project?: string;
    developer?: string;
    sprint?: string;
    tasks: ChecklistTask[];
}
/** Load planned tasks from a checklist file (json / md / html / pdf). */
export declare function loadChecklistFromFile(file: string): Promise<LoadedChecklist>;
