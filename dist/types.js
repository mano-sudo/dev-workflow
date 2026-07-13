"use strict";
/**
 * dev-workflow — shared type contract.
 *
 * Every service and command builds against these interfaces. Do not change a
 * field's meaning without updating all consumers; add optional fields instead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    backgroundTracking: true,
    autoSave: true,
    template: "default",
    export: "pdf",
};
