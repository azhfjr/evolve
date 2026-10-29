import { BOARD_TITLE, type BoardQuery } from "./model";
export type PortfolioReportRow = {
  externalId: string;
  name: string;
  category: string;
  scope: string;
  voltage: string;
  capacity: number | null;
  unit: string;
  codYear: number | null;
  startYear: number | null;
  stage: number;
  completed: boolean;
  valid: boolean;
  fileCount: number;
  responsible: string;
  progressReviewedAt: string | null;
  progressReviewedBy: string | null;
  progressReviewNote: string;
  documentReviewNote: string;
};
export type PortfolioReportData = {
  generatedAt: string;
  generatedBy: string;
  timeZone: string;
  query: BoardQuery;
  stages: string[];
  rows: PortfolioReportRow[];
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
export function renderPortfolioReport(data: PortfolioReportData) {
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: data.timeZone,
    }).format(new Date(value));
  const filters =
    Object.entries(data.query)
      .filter(
        ([key, value]) =>
          !["page", "sort", "direction"].includes(key) && value !== "",
      )
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ") || "All projects";
  const valid = data.rows.filter((row) => row.valid).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(BOARD_TITLE)} · Portfolio report</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:32px auto;padding:0 24px;max-width:1600px;font:14px/1.5 Arial,sans-serif;color:#17251c;background:#fff}h1{font-size:25px;margin:8px 0}h2{font-size:16px}p{margin:8px 0}.meta{color:#536459}.summary{display:flex;gap:24px;flex-wrap:wrap;padding:14px 0;border-block:1px solid #d9e1db;margin:20px 0}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left;font-size:12px}th,td{padding:10px 8px;vertical-align:top;border-bottom:1px solid #d9e1db;overflow-wrap:anywhere}th{background:#eef3ef}small{display:block;color:#536459}td:first-child{min-width:150px}footer{margin:28px 0;font-size:12px;color:#536459}@media print{@page{size:landscape;margin:12mm}body{margin:0;padding:0;font-size:11px}.print-help{display:none}.scroll{overflow:visible}table{font-size:10px}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:6px 4px}h1{font-size:20px}}
  </style></head><body><p class="meta">Evolve · Board Room</p><h1>${escape(BOARD_TITLE)}</h1><h2>Project portfolio report</h2><p class="meta">Generated ${escape(date(data.generatedAt))} (${escape(data.timeZone)}) by ${escape(data.generatedBy)}</p><p><strong>Filters:</strong> ${escape(filters)}</p><p class="print-help">Use your browser’s Print command to print or save this dated report as a PDF. This report includes every matching project, across all result pages.</p><div class="summary"><span><strong>${data.rows.length}</strong> projects</span><span><strong>${valid}</strong> admin-reviewed valid</span><span><strong>${data.rows.filter((row) => row.completed).length}</strong> completed</span></div><div class="scroll"><table><thead><tr><th>Project / RUPTL Code</th><th>Category</th><th>Capacity / Voltage</th><th>Years</th><th>Stage</th><th>Documents</th><th>Responsibility</th><th>Progress review</th></tr></thead><tbody>${data.rows.map((row) => `<tr><td><strong>${escape(row.name)}</strong><small>${escape(row.externalId)}</small></td><td>${escape(row.category || "Not set")}</td><td>${row.capacity === null ? "Not set" : `${escape(row.capacity.toLocaleString("en-US"))} ${escape(row.unit)}`}<small>${escape(row.voltage || "Voltage not set")}</small></td><td>${row.startYear ?? "—"} → ${row.codYear ?? "—"}</td><td>${row.completed ? "Completed" : row.stage === 0 ? "Not started" : `${escape(data.stages[row.stage - 1] || `Stage ${row.stage}`)} (${row.stage}/10)`}</td><td>${row.valid ? "Valid" : row.fileCount ? "Needs review" : "No files"}${row.fileCount ? ` · ${row.fileCount} files` : ""}<small>${escape(row.documentReviewNote)}</small></td><td>${escape(row.responsible || "Not assigned")}</td><td>${row.progressReviewedAt ? escape(date(row.progressReviewedAt)) : "Not yet reviewed"}<small>${escape(row.progressReviewedBy)}</small><small>${escape(row.progressReviewNote)}</small></td></tr>`).join("") || '<tr><td colspan="8">No matching projects.</td></tr>'}</tbody></table></div><footer>Stages represent workflow positions, not a percentage of physical completion. Document validity is an administrator’s review decision. Capacity values retain their own units; unlike units are never summed. This report records the values available when it was generated; it is not a saved baseline.</footer></body></html>`;
}
