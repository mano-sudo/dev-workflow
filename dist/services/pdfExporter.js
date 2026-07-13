"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderChecklistPDF = renderChecklistPDF;
exports.renderWorklogPDF = renderWorklogPDF;
/**
 * pdfExporter — renders Development Checklist and Worklog documents to PDF.
 *
 * Implements the visual contract in DESIGN_SPEC.md using pdfkit only.
 * Offline, no Chromium. A4 portrait, 54pt margins, Helvetica family.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const PDFDocument = require("pdfkit");
/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const COLORS = {
    ink: "#1a1a1a",
    body: "#333333",
    muted: "#6b7280",
    faint: "#9ca3af",
    rule: "#e5e7eb",
    panelBg: "#f3f4f6",
    accentBar: "#374151",
    high: "#dc2626",
    medium: "#ea580c",
    low: "#0891b2",
    doneGreen: "#059669",
    doneBg: "#ecfdf5",
    codeBg: "#f3f4f6",
    amber: "#f59e0b",
    red: "#ef4444",
    white: "#ffffff",
};
const PAGE = {
    size: "A4",
    margin: 54,
};
const FONT = {
    reg: "Helvetica",
    bold: "Helvetica-Bold",
    obl: "Helvetica-Oblique",
    mono: "Courier",
};
function makeCtx(doc, footer) {
    const left = PAGE.margin;
    const right = doc.page.width - PAGE.margin;
    return {
        doc,
        left,
        right,
        contentW: right - left,
        bottom: doc.page.height - PAGE.margin,
        footer,
    };
}
/* ------------------------------------------------------------------ */
/* Pagination + footer                                                 */
/* ------------------------------------------------------------------ */
function drawFooter(ctx) {
    const { doc } = ctx;
    const y = doc.page.height - PAGE.margin + 16;
    // The footer sits below the bottom margin. Writing text there would make
    // pdfkit auto-insert a page break, so temporarily disable the bottom margin
    // (and preserve the content cursor) while we draw.
    const savedBottom = doc.page.margins.bottom;
    const savedY = doc.y;
    doc.page.margins.bottom = 0;
    doc
        .font(FONT.reg)
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(ctx.footer, ctx.left, y, {
        width: ctx.contentW,
        align: "center",
        lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
    doc.y = savedY;
}
function addPage(ctx) {
    ctx.doc.addPage();
    ctx.bottom = ctx.doc.page.height - PAGE.margin;
    drawFooter(ctx);
    ctx.doc.y = PAGE.margin;
}
/** Guard: if `needed` pt won't fit before the bottom margin, start a page. */
function ensureSpace(ctx, needed) {
    if (ctx.doc.y + needed > ctx.bottom) {
        addPage(ctx);
    }
}
/* ------------------------------------------------------------------ */
/* Primitive helpers                                                   */
/* ------------------------------------------------------------------ */
function hairline(ctx, x, y, w) {
    ctx.doc
        .save()
        .lineWidth(0.75)
        .strokeColor(COLORS.rule)
        .moveTo(x, y)
        .lineTo(x + w, y)
        .stroke()
        .restore();
}
function priorityColor(p) {
    if (p === "High")
        return COLORS.high;
    if (p === "Medium")
        return COLORS.medium;
    return COLORS.low;
}
/** Draw an empty rounded-square checkbox glyph. Returns box size. */
function drawCheckbox(doc, x, y, size = 11, checked = false) {
    doc
        .save()
        .lineWidth(1)
        .strokeColor(COLORS.faint)
        .roundedRect(x, y, size, size, 2)
        .stroke();
    if (checked) {
        doc
            .lineWidth(1.4)
            .strokeColor(COLORS.doneGreen)
            .moveTo(x + size * 0.22, y + size * 0.52)
            .lineTo(x + size * 0.42, y + size * 0.74)
            .lineTo(x + size * 0.8, y + size * 0.26)
            .stroke();
    }
    doc.restore();
}
function parseRuns(input) {
    const runs = [];
    const parts = input.split("`");
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === "")
            continue;
        runs.push({ text: parts[i], code: i % 2 === 1 });
    }
    if (runs.length === 0)
        runs.push({ text: "", code: false });
    return runs;
}
/**
 * Render inline-code-aware wrapping text inside a box. Returns the height
 * consumed. Does NOT paginate (caller must ensureSpace using measured height).
 */
function drawRichText(ctx, text, x, y, width, opts = {}) {
    const { doc } = ctx;
    const size = opts.size ?? 8.5;
    const color = opts.color ?? COLORS.body;
    const baseFont = opts.font ?? FONT.reg;
    const lineGap = 2;
    const lineHeight = size + lineGap + 1.5;
    const runs = parseRuns(text);
    const toks = [];
    for (const r of runs) {
        const words = r.text.split(/(\s+)/).filter((w) => w.length > 0);
        for (const w of words)
            toks.push({ word: w, code: r.code });
    }
    let cx = x;
    let cy = y;
    const measure = (t) => {
        doc.font(t.code ? FONT.mono : baseFont).fontSize(size);
        return doc.widthOfString(t.word);
    };
    const flushNewline = () => {
        cx = x;
        cy += lineHeight;
    };
    for (const t of toks) {
        const isSpace = /^\s+$/.test(t.word);
        const w = measure(t);
        if (!isSpace && cx + w > x + width + 0.5 && cx > x) {
            flushNewline();
        }
        if (isSpace && cx === x) {
            // don't render leading space on a wrapped line
            continue;
        }
        if (t.code && !isSpace) {
            // background highlight
            doc
                .save()
                .fillColor(COLORS.codeBg)
                .roundedRect(cx - 1, cy - 1, w + 2, size + 3, 2)
                .fill()
                .restore();
            doc.font(FONT.mono).fontSize(size).fillColor(COLORS.body).text(t.word, cx, cy, {
                lineBreak: false,
            });
        }
        else {
            doc.font(baseFont).fontSize(size).fillColor(color).text(t.word, cx, cy, {
                lineBreak: false,
            });
        }
        cx += w;
    }
    return cy - y + lineHeight;
}
/** Measure the height drawRichText would consume (no drawing). */
function measureRichText(ctx, text, width, size = 8.5, baseFont = FONT.reg) {
    const { doc } = ctx;
    const lineGap = 2;
    const lineHeight = size + lineGap + 1.5;
    const runs = parseRuns(text);
    const toks = [];
    for (const r of runs) {
        const words = r.text.split(/(\s+)/).filter((w) => w.length > 0);
        for (const w of words)
            toks.push({ word: w, code: r.code });
    }
    let cx = 0;
    let lines = 1;
    for (const t of toks) {
        const isSpace = /^\s+$/.test(t.word);
        doc.font(t.code ? FONT.mono : baseFont).fontSize(size);
        const w = doc.widthOfString(t.word);
        if (!isSpace && cx + w > width + 0.5 && cx > 0) {
            lines++;
            cx = 0;
        }
        if (isSpace && cx === 0)
            continue;
        cx += w;
    }
    return lines * lineHeight;
}
/* ------------------------------------------------------------------ */
/* Title block                                                         */
/* ------------------------------------------------------------------ */
function titleBlock(ctx, title, subtitle) {
    const { doc } = ctx;
    doc.y = PAGE.margin;
    doc.font(FONT.bold).fontSize(26).fillColor(COLORS.ink);
    doc.text(title, ctx.left, doc.y, { width: ctx.contentW });
    let y = doc.y + 6;
    // 2pt ink rule
    doc
        .save()
        .lineWidth(2)
        .strokeColor(COLORS.ink)
        .moveTo(ctx.left, y)
        .lineTo(ctx.right, y)
        .stroke()
        .restore();
    y += 8;
    doc.font(FONT.reg).fontSize(9.5).fillColor(COLORS.muted);
    doc.text(subtitle || "", ctx.left, y, { width: ctx.contentW });
    doc.y += 14;
}
/* ------------------------------------------------------------------ */
/* HOW TO USE callout                                                  */
/* ------------------------------------------------------------------ */
function howToUse(ctx, lines) {
    const { doc } = ctx;
    const padX = 12;
    const padY = 10;
    const barW = 3;
    const innerW = ctx.contentW - padX * 2 - barW;
    const headH = 7.5 + 6;
    const bodyLineH = 13;
    const bodyH = lines.length * bodyLineH;
    const boxH = padY * 2 + headH + bodyH;
    ensureSpace(ctx, boxH + 10);
    const top = doc.y;
    // panel background
    doc
        .save()
        .fillColor(COLORS.panelBg)
        .roundedRect(ctx.left, top, ctx.contentW, boxH, 3)
        .fill()
        .restore();
    // accent bar flush on left edge
    doc
        .save()
        .fillColor(COLORS.accentBar)
        .rect(ctx.left, top, barW, boxH)
        .fill()
        .restore();
    const tx = ctx.left + barW + padX;
    let ty = top + padY;
    doc
        .font(FONT.bold)
        .fontSize(7.5)
        .fillColor(COLORS.accentBar)
        .text("HOW TO USE THIS PAGE", tx, ty, {
        width: innerW,
        characterSpacing: 0.8,
    });
    ty += headH;
    doc.font(FONT.reg).fontSize(8.5).fillColor(COLORS.body);
    for (let i = 0; i < lines.length; i++) {
        const label = `${i + 1}.`;
        doc.text(label, tx, ty, { width: 14, lineBreak: false });
        doc.text(lines[i], tx + 14, ty, { width: innerW - 14 });
        ty += bodyLineH;
    }
    doc.y = top + boxH + 14;
}
/* ------------------------------------------------------------------ */
/* Meta grid                                                           */
/* ------------------------------------------------------------------ */
function metaCell(ctx, label, value, x, y, w) {
    const { doc } = ctx;
    doc
        .font(FONT.bold)
        .fontSize(7.5)
        .fillColor(COLORS.muted)
        .text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });
    const vy = y + 11;
    doc
        .font(FONT.bold)
        .fontSize(10.5)
        .fillColor(COLORS.ink)
        .text(value || " ", x, vy, { width: w, lineBreak: false });
    hairline(ctx, x, vy + 15, w - 12);
}
function metaGrid(ctx, rows) {
    const { doc } = ctx;
    const colW = ctx.contentW / 2;
    const rowH = 40;
    ensureSpace(ctx, rowH * rows.length + 8);
    let y = doc.y;
    for (const [l1, v1, l2, v2] of rows) {
        metaCell(ctx, l1, v1, ctx.left, y, colW);
        metaCell(ctx, l2, v2, ctx.left + colW, y, colW);
        y += rowH;
    }
    doc.y = y + 6;
}
/* ------------------------------------------------------------------ */
/* Section header + caption                                            */
/* ------------------------------------------------------------------ */
function sectionHeader(ctx, text) {
    const { doc } = ctx;
    ensureSpace(ctx, 26);
    doc.y += 6;
    doc
        .font(FONT.bold)
        .fontSize(11)
        .fillColor(COLORS.ink)
        .text(text.toUpperCase(), ctx.left, doc.y, { width: ctx.contentW });
    const y = doc.y + 3;
    hairline(ctx, ctx.left, y, ctx.contentW);
    doc.y = y + 6;
}
function sectionCaption(ctx, text) {
    if (!text)
        return;
    const { doc } = ctx;
    doc
        .font(FONT.obl)
        .fontSize(8.5)
        .fillColor(COLORS.muted)
        .text(text, ctx.left, doc.y, { width: ctx.contentW });
    doc.y += 4;
}
/* ------------------------------------------------------------------ */
/* Hairline-separated free-text lines                                  */
/* ------------------------------------------------------------------ */
function textLines(ctx, items, opts = {}) {
    const { doc } = ctx;
    const size = opts.size ?? 9;
    const padY = 5;
    const numW = opts.numbered ? 18 : 0;
    for (let i = 0; i < items.length; i++) {
        const text = items[i];
        const textW = ctx.contentW - numW;
        const h = Math.max(measureRichText(ctx, text || " ", textW, size), size + 3);
        ensureSpace(ctx, h + padY * 2);
        const top = doc.y + padY;
        if (opts.numbered) {
            doc
                .font(FONT.bold)
                .fontSize(size)
                .fillColor(COLORS.muted)
                .text(`${i + 1}.`, ctx.left, top, { width: numW, lineBreak: false });
        }
        drawRichText(ctx, text || "", ctx.left + numW, top, textW, {
            size,
            color: COLORS.body,
        });
        const y = top + h + padY;
        hairline(ctx, ctx.left, y, ctx.contentW);
        doc.y = y;
    }
}
/** Blank hairline placeholder rows. */
function blankLines(ctx, count, rowH = 16) {
    const { doc } = ctx;
    for (let i = 0; i < count; i++) {
        ensureSpace(ctx, rowH);
        const y = doc.y + rowH;
        hairline(ctx, ctx.left, y, ctx.contentW);
        doc.y = y;
    }
}
function drawTable(ctx, cols, rows) {
    const { doc } = ctx;
    const pad = 7;
    const headerH = 20;
    const minRowH = 22;
    // total width normalization: last column absorbs remainder
    const fixed = cols.slice(0, -1).reduce((s, c) => s + c.width, 0);
    const widths = cols.map((c, i) => i === cols.length - 1 ? ctx.contentW - fixed : c.width);
    ensureSpace(ctx, headerH + minRowH + 8);
    const tableTop = doc.y;
    // header row
    const drawHeader = (top) => {
        doc
            .save()
            .fillColor(COLORS.panelBg)
            .rect(ctx.left, top, ctx.contentW, headerH)
            .fill()
            .restore();
        let cx = ctx.left;
        for (let i = 0; i < cols.length; i++) {
            doc
                .font(FONT.bold)
                .fontSize(7.5)
                .fillColor(COLORS.muted)
                .text(cols[i].header.toUpperCase(), cx + pad, top + 6, {
                width: widths[i] - pad * 2,
                characterSpacing: 0.5,
                lineBreak: false,
            });
            cx += widths[i];
        }
        return top + headerH;
    };
    let y = drawHeader(tableTop);
    let sectionStart = tableTop; // where the current page's border begins
    for (const row of rows) {
        // measure row height
        let contentH = 0;
        for (let i = 0; i < cols.length; i++) {
            contentH = Math.max(contentH, row.measure(ctx, i, widths[i] - pad * 2));
        }
        const rowH = Math.max(minRowH, contentH + pad * 2);
        if (y + rowH > ctx.bottom) {
            // close border on current page, paginate, restart with header
            drawTableBorder(ctx, sectionStart, y, widths);
            addPage(ctx);
            sectionStart = doc.y;
            y = drawHeader(doc.y);
        }
        // draw cells
        let cx = ctx.left;
        for (let i = 0; i < cols.length; i++) {
            row.render(ctx, i, cx + pad, y + pad, widths[i] - pad * 2, rowH - pad * 2);
            cx += widths[i];
        }
        // row separator hairline
        hairline(ctx, ctx.left, y + rowH, ctx.contentW);
        y += rowH;
    }
    drawTableBorder(ctx, sectionStart, y, widths);
    doc.y = y + 8;
}
function drawTableBorder(ctx, top, bottom, widths) {
    const { doc } = ctx;
    doc
        .save()
        .lineWidth(1)
        .strokeColor(COLORS.rule)
        .roundedRect(ctx.left, top, ctx.contentW, bottom - top, 4)
        .stroke()
        .restore();
}
/* ------------------------------------------------------------------ */
/* Checklist status pill / worklog pill                                */
/* ------------------------------------------------------------------ */
function worklogStatusPill(ctx, status, x, y, maxW) {
    const { doc } = ctx;
    let bg = COLORS.doneBg;
    let fg = COLORS.doneGreen;
    let label = "✓ Completed";
    if (status === "Partial") {
        bg = "#fff7ed";
        fg = COLORS.medium;
        label = "◐ Partial";
    }
    else if (status === "Not Done") {
        bg = "#fef2f2";
        fg = COLORS.red;
        label = "✗ Not Done";
    }
    doc.font(FONT.bold).fontSize(8.5);
    const tw = doc.widthOfString(label);
    const pillW = Math.min(tw + 14, maxW);
    const pillH = 16;
    doc
        .save()
        .fillColor(bg)
        .roundedRect(x, y, pillW, pillH, 8)
        .fill()
        .restore();
    doc
        .fillColor(fg)
        .text(label, x, y + 4, { width: pillW, align: "center", lineBreak: false });
}
/* ------------------------------------------------------------------ */
/* Legend row (checklist)                                              */
/* ------------------------------------------------------------------ */
function legendRow(ctx) {
    const { doc } = ctx;
    ensureSpace(ctx, 22);
    const y = doc.y + 4;
    let x = ctx.left;
    const gap = 14;
    const size = 8;
    const drawDot = (color) => {
        doc.save().fillColor(color).circle(x + 3, y + 5, 3).fill().restore();
        return 9;
    };
    const drawSquare = (color) => {
        doc.save().fillColor(color).rect(x, y + 2, 6, 6).fill().restore();
        return 9;
    };
    const label = (t) => {
        doc
            .font(FONT.reg)
            .fontSize(size)
            .fillColor(COLORS.body)
            .text(t, x, y + 1, { lineBreak: false });
        x += doc.widthOfString(t) + gap;
    };
    // ☐ Not Started
    drawCheckbox(doc, x, y, 9);
    x += 12;
    label("Not Started");
    // ● In Progress (amber)
    x += drawDot(COLORS.amber);
    label("In Progress");
    // ✓ Completed (green check in box)
    drawCheckbox(doc, x, y, 9, true);
    x += 12;
    label("Completed");
    // ■ On Hold (blue square)
    x += drawSquare(COLORS.low);
    label("On Hold");
    // ● Cancelled (red dot)
    x += drawDot(COLORS.red);
    label("Cancelled");
    doc.y = y + 14;
}
function statRow(ctx, stats) {
    const { doc } = ctx;
    const n = Math.max(stats.length, 1);
    const cellW = ctx.contentW / n;
    const cellH = 56;
    ensureSpace(ctx, cellH + 6);
    const top = doc.y;
    for (let i = 0; i < stats.length; i++) {
        const s = stats[i];
        const x = ctx.left + i * cellW;
        doc.font(FONT.bold).fontSize(26).fillColor(COLORS.ink);
        doc.text(s.big || " ", x, top, { width: cellW, lineBreak: false });
        if (s.small) {
            const bw = doc.widthOfString(s.big || " ");
            doc
                .font(FONT.bold)
                .fontSize(13)
                .fillColor(COLORS.faint)
                .text(" " + s.small, x + bw, top + 12, { lineBreak: false });
        }
        hairline(ctx, x, top + 34, cellW - 12);
        doc
            .font(FONT.bold)
            .fontSize(7.5)
            .fillColor(COLORS.muted)
            .text(s.label.toUpperCase(), x, top + 40, {
            width: cellW - 12,
            characterSpacing: 0.5,
        });
    }
    doc.y = top + cellH;
}
/* ------------------------------------------------------------------ */
/* Time-spent grid (2 col x 3 row)                                     */
/* ------------------------------------------------------------------ */
function timeGrid(ctx, cells) {
    const { doc } = ctx;
    const colW = ctx.contentW / 2;
    const cellH = 38;
    const rows = Math.ceil(cells.length / 2);
    ensureSpace(ctx, cellH * rows + 6);
    const top = doc.y;
    for (let i = 0; i < cells.length; i++) {
        const r = Math.floor(i / 2);
        const c = i % 2;
        const x = ctx.left + c * colW;
        const y = top + r * cellH;
        const [label, value] = cells[i];
        doc
            .font(FONT.bold)
            .fontSize(7.5)
            .fillColor(COLORS.muted)
            .text(label.toUpperCase(), x, y, { width: colW - 12, characterSpacing: 0.5 });
        doc
            .font(FONT.bold)
            .fontSize(10.5)
            .fillColor(COLORS.ink)
            .text(value || " ", x, y + 11, { width: colW - 12, lineBreak: false });
        hairline(ctx, x, y + 27, colW - 12);
    }
    doc.y = top + cellH * rows + 4;
}
/* ------------------------------------------------------------------ */
/* Overall-status option row (worklog)                                 */
/* ------------------------------------------------------------------ */
function overallStatusRow(ctx, selected) {
    const { doc } = ctx;
    ensureSpace(ctx, 24);
    const y = doc.y + 4;
    let x = ctx.left;
    const gap = 24;
    const opts = [
        { label: "On Schedule", dot: COLORS.doneGreen },
        { label: "Slight Delay", dot: COLORS.amber },
        { label: "Delayed", dot: COLORS.red },
    ];
    for (const o of opts) {
        const checked = selected === o.label;
        drawCheckbox(doc, x, y, 11, checked);
        x += 15;
        // status dot
        doc.save().fillColor(o.dot).circle(x + 3, y + 6, 3).fill().restore();
        x += 9;
        doc
            .font(FONT.reg)
            .fontSize(9)
            .fillColor(COLORS.body)
            .text(o.label, x, y + 2, { lineBreak: false });
        x += doc.widthOfString(o.label) + gap;
    }
    doc.y = y + 18;
}
/* ------------------------------------------------------------------ */
/* Document finalize                                                   */
/* ------------------------------------------------------------------ */
function finalize(doc, outPath) {
    return new Promise((resolve, reject) => {
        try {
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
        }
        catch (e) {
            reject(e);
            return;
        }
        const stream = fs.createWriteStream(outPath);
        stream.on("finish", () => resolve(outPath));
        stream.on("error", reject);
        doc.pipe(stream);
        doc.end();
    });
}
function fileStem(p) {
    return path.basename(p).replace(/\.pdf$/i, "");
}
/* ------------------------------------------------------------------ */
/* CHECKLIST                                                           */
/* ------------------------------------------------------------------ */
const CHECKLIST_HOWTO = [
    "List every planned task with its priority and current status.",
    "Use the STATUS checkbox column to track progress; see the legend below the table.",
    "GOALS describe outcomes that should be true when finished — not tasks.",
    "EXPECTED DELIVERABLES are the concrete finished things you will hand over.",
];
async function renderChecklistPDF(data, outPath, opts = {}) {
    const blank = !!opts.blank;
    const doc = new PDFDocument({
        size: PAGE.size,
        margins: {
            top: PAGE.margin,
            bottom: PAGE.margin,
            left: PAGE.margin,
            right: PAGE.margin,
        },
        autoFirstPage: true,
        bufferPages: false,
    });
    const stem = fileStem(outPath);
    const subtitle = blank ? "" : data.subtitle || "";
    const footerMid = opts.footerNote || subtitle || "Planned tasks, goals & deliverables";
    const footer = `Development Checklist · ${footerMid} · ${stem}`;
    const ctx = makeCtx(doc, footer);
    drawFooter(ctx);
    titleBlock(ctx, "Development Checklist", subtitle);
    howToUse(ctx, CHECKLIST_HOWTO);
    const val = (v) => (blank ? "" : v || "");
    metaGrid(ctx, [
        ["Project", val(data.project), "Developer", val(data.developer)],
        ["Date", val(data.date), "Sprint / Version", val(data.sprint)],
    ]);
    // PLANNED TASKS
    sectionHeader(ctx, "Planned Tasks");
    sectionCaption(ctx, "Everything scoped for this cycle, by priority.");
    const cols = [
        { header: "Status", width: 46 },
        { header: "Priority", width: 62 },
        { header: "Task", width: 150 },
        { header: "Notes", width: 0 },
    ];
    const tasks = blank
        ? new Array(8).fill(null)
        : data.tasks.length
            ? data.tasks
            : new Array(8).fill(null);
    const rows = tasks.map((t) => ({
        measure: (c, col, w) => {
            if (col === 3 && t && t.notes)
                return measureRichText(c, t.notes, w, 8.5);
            if (col === 2 && t)
                return measureRichText(c, t.task, w, 9, FONT.bold);
            return 12;
        },
        render: (c, col, x, y, w) => {
            const { doc: d } = c;
            if (col === 0) {
                const checked = !!t && t.status === "Completed";
                drawCheckbox(d, x + (w - 11) / 2, y, 11, checked);
            }
            else if (col === 1) {
                if (t) {
                    d.font(FONT.bold)
                        .fontSize(9)
                        .fillColor(priorityColor(t.priority))
                        .text(t.priority, x, y + 1, { width: w, lineBreak: false });
                }
            }
            else if (col === 2) {
                if (t) {
                    d.font(FONT.bold)
                        .fontSize(9)
                        .fillColor(COLORS.ink)
                        .text(t.task, x, y + 1, { width: w });
                }
            }
            else {
                if (t && t.notes)
                    drawRichText(c, t.notes, x, y + 1, w, { size: 8.5 });
            }
        },
    }));
    drawTable(ctx, cols, rows);
    // legend
    legendRow(ctx);
    // GOALS
    sectionHeader(ctx, "Goals");
    sectionCaption(ctx, "What should be true by the end? Outcomes, not tasks.");
    if (blank || !data.goals || data.goals.length === 0)
        blankLines(ctx, 3);
    else
        textLines(ctx, data.goals, { size: 9 });
    // DELIVERABLES
    sectionHeader(ctx, "Expected Deliverables");
    sectionCaption(ctx, "The finished things to hand over.");
    if (blank || !data.deliverables || data.deliverables.length === 0)
        blankLines(ctx, 3);
    else
        textLines(ctx, data.deliverables, { size: 9 });
    return finalize(doc, outPath);
}
/* ------------------------------------------------------------------ */
/* WORKLOG                                                             */
/* ------------------------------------------------------------------ */
const WORKLOG_HOWTO = [
    "Mark each planned checklist task Completed, Partial, or Not Done with its result.",
    "Log additional work, blockers, and the next priorities to pick up.",
    "The summary and time-spent grids capture the shape of the day — estimates are fine.",
    "Tick one overall status so anyone can see if the work is on track.",
];
function fmtHours(v) {
    if (v === undefined || v === null || isNaN(v))
        return "";
    return `${v.toFixed(1)} h`;
}
async function renderWorklogPDF(data, outPath, opts = {}) {
    const blank = !!opts.blank;
    const doc = new PDFDocument({
        size: PAGE.size,
        margins: {
            top: PAGE.margin,
            bottom: PAGE.margin,
            left: PAGE.margin,
            right: PAGE.margin,
        },
        autoFirstPage: true,
        bufferPages: false,
    });
    const stem = fileStem(outPath);
    const subtitle = blank ? "" : data.subtitle || "";
    const footerMid = opts.footerNote || subtitle || "Daily engineering worklog";
    const footer = `Development Worklog · ${footerMid} · ${stem}`;
    const ctx = makeCtx(doc, footer);
    drawFooter(ctx);
    titleBlock(ctx, "Development Worklog", subtitle);
    howToUse(ctx, WORKLOG_HOWTO);
    const val = (v) => (blank ? "" : v || "");
    metaGrid(ctx, [
        ["Project", val(data.project), "Developer", val(data.developer)],
        ["Date", val(data.date), "Sprint / Version", val(data.sprint)],
    ]);
    // 1. CHECKLIST COMPLETION
    sectionHeader(ctx, "1. Checklist Completion");
    const ref = blank ? "" : data.checklistRef || "";
    sectionCaption(ctx, ref
        ? `Every development task from ${ref}.`
        : "Every development task from the source checklist.");
    const cCols = [
        { header: "Planned Task", width: 230 },
        { header: "Status", width: 90 },
        { header: "Result", width: 0 },
    ];
    const items = blank
        ? new Array(6).fill(null)
        : data.checklistItems.length
            ? data.checklistItems
            : new Array(6).fill(null);
    const cRows = items.map((it) => ({
        measure: (c, col, w) => {
            if (col === 0 && it)
                return measureRichText(c, it.task, w, 9, FONT.bold);
            if (col === 2 && it && it.result)
                return measureRichText(c, it.result, w, 8.5);
            return 12;
        },
        render: (c, col, x, y, w) => {
            const { doc: d } = c;
            if (col === 0) {
                if (it)
                    d.font(FONT.bold)
                        .fontSize(9)
                        .fillColor(COLORS.ink)
                        .text(it.task, x, y + 1, { width: w });
            }
            else if (col === 1) {
                if (it)
                    worklogStatusPill(c, it.status, x, y, w);
                else {
                    // blank: show empty completed-shaped pill outline
                    d.save()
                        .lineWidth(0.75)
                        .strokeColor(COLORS.rule)
                        .roundedRect(x, y, Math.min(w, 76), 16, 8)
                        .stroke()
                        .restore();
                }
            }
            else {
                if (it && it.result)
                    drawRichText(c, it.result, x, y + 1, w, { size: 8.5 });
            }
        },
    }));
    drawTable(ctx, cCols, cRows);
    // 2. ADDITIONAL TASKS COMPLETED
    sectionHeader(ctx, "2. Additional Tasks Completed");
    sectionCaption(ctx, "Work done beyond the planned checklist.");
    if (blank || !data.additional || data.additional.length === 0)
        blankLines(ctx, 3);
    else
        textLines(ctx, data.additional, { size: 8.5 });
    // 3. SUMMARY OF WORK COMPLETED
    sectionHeader(ctx, "3. Summary of Work Completed");
    if (blank) {
        statRow(ctx, [
            { big: "", label: "Gap Tasks Completed" },
            { big: "", label: "Partially Done" },
            { big: "", label: "Additional" },
            { big: "", label: "Overall Progress" },
        ]);
    }
    else {
        const total = data.checklistItems.length;
        const completed = data.checklistItems.filter((i) => i.status === "Completed").length;
        const partial = data.checklistItems.filter((i) => i.status === "Partial").length;
        const additionalN = data.additional ? data.additional.length : 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        statRow(ctx, [
            {
                big: String(completed),
                small: `/ ${total}`,
                label: "Gap Tasks Completed",
            },
            { big: String(partial), label: "Partially Done" },
            { big: String(additionalN), label: `Additional (${additionalN})` },
            { big: `${pct}%`, label: "Overall Progress" },
        ]);
    }
    // 4. TASKS NOT COMPLETED
    sectionHeader(ctx, "4. Tasks Not Completed");
    if (blank) {
        blankLines(ctx, 3);
    }
    else if (!data.notCompleted || data.notCompleted.length === 0) {
        doc
            .font(FONT.obl)
            .fontSize(8.5)
            .fillColor(COLORS.faint)
            .text("Nothing outstanding — all planned work was addressed.", ctx.left, doc.y + 4, {
            width: ctx.contentW,
        });
        doc.y += 6;
    }
    else {
        textLines(ctx, data.notCompleted, { size: 8.5 });
    }
    // 5 / 6 two-column block: BLOCKERS | NEXT PRIORITIES
    twoColumnBlock(ctx, data, blank);
    // 7. TIME SPENT
    sectionHeader(ctx, "7. Time Spent");
    sectionCaption(ctx, "Roughly how the day went. Estimates are fine.");
    const t = data.time || {};
    timeGrid(ctx, [
        ["Planning / Audit", blank ? "" : fmtHours(t.planning)],
        ["Development", blank ? "" : fmtHours(t.development)],
        ["Testing", blank ? "" : fmtHours(t.testing)],
        ["Bug Fixes", blank ? "" : fmtHours(t.bugFixes)],
        ["Meetings", blank ? "" : fmtHours(t.meetings)],
        ["Total Hours", blank ? "" : fmtHours(t.total)],
    ]);
    // 8. OVERALL STATUS
    sectionHeader(ctx, "8. Overall Status");
    sectionCaption(ctx, "Tick one.");
    overallStatusRow(ctx, blank ? null : data.status);
    // 9. NOTES
    sectionHeader(ctx, "9. Notes");
    if (blank || !data.notes || data.notes.length === 0)
        blankLines(ctx, 3);
    else
        textLines(ctx, data.notes, { size: 9 });
    return finalize(doc, outPath);
}
/* ------------------------------------------------------------------ */
/* Two-column BLOCKERS / NEXT PRIORITIES                               */
/* ------------------------------------------------------------------ */
function twoColumnBlock(ctx, data, blank) {
    const { doc } = ctx;
    const gutter = 20;
    const colW = (ctx.contentW - gutter) / 2;
    const leftX = ctx.left;
    const rightX = ctx.left + colW + gutter;
    // We render two independent columns sharing a starting y, using a temporary
    // sub-context whose left/right/contentW map to each column.
    ensureSpace(ctx, 80);
    const startY = doc.y;
    const renderColumn = (x, header, caption, items, numbered) => {
        const sub = {
            ...ctx,
            left: x,
            right: x + colW,
            contentW: colW,
        };
        sub.doc.y = startY;
        sectionHeader(sub, header);
        sectionCaption(sub, caption);
        if (blank || !items || items.length === 0)
            blankLines(sub, 3);
        else
            textLines(sub, items, { size: 8.5, numbered });
        return sub.doc.y;
    };
    const yLeft = renderColumn(leftX, "5. Blockers", "Anything slowing the work down.", data.blockers, false);
    const yRight = renderColumn(rightX, "6. Next Priorities", "What to pick up next.", data.next, true);
    doc.y = Math.max(yLeft, yRight) + 4;
}
