import {
  projectSchema,
  normalizeProjectPayload,
  type ProjectPayload,
} from "./model";
export const CSV_COLUMNS = {
  externalId: "RUPTL Code",
  name: "Project name",
  category: "Primary category",
  scope: "Scope",
  voltage: "Voltage",
  capacity: "Capacity",
  unit: "Capacity unit",
  codYear: "Planned COD year",
  stage: "Current stage",
  startYear: "Start year",
  description: "Description",
  location: "Location",
  links: "Project links",
  linkLabels: "Project link labels",
  completed: "Completed",
  customValues: "Custom fields",
} as const;
export type ColumnKey = keyof typeof CSV_COLUMNS;
export type ColumnMapping = Partial<Record<ColumnKey, string>> & {
  assetCodes?: string;
};
export type ImportPatch = Partial<Omit<ProjectPayload, "category">> & {
  category?: string;
};
export function readCSV(source: string): string[][] {
  if (
    new TextEncoder().encode(source).length > 5 * 1024 * 1024 ||
    source.includes("\0")
  )
    throw Error("Use UTF-8 CSV up to 5 MiB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
    if (rows.length > 5001)
      throw Error("Import at most 5,000 projects at once.");
  };
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === ",") pushCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === '"') throw Error("Invalid CSV quotes.");
    else if (closed) {
      if (!/\s/.test(c)) throw Error("Unexpected text after a quoted field.");
    } else cell += c;
  }
  if (quoted) throw Error("CSV has an unclosed quoted field.");
  if (cell || row.length || closed) pushRow();
  return rows;
}
export function defaultMapping(headers: string[]): ColumnMapping {
  const normalized = (value: string) =>
    value.trim().toLowerCase().replaceAll("_", " ");
  return Object.fromEntries(
    Object.entries(CSV_COLUMNS).flatMap(([key, label]) => {
      // Prefer the canonical header while keeping previously downloaded templates usable.
      const h =
        headers.find((h) => normalized(h) === label.toLowerCase()) ??
        (key === "externalId"
          ? headers.find((h) => normalized(h) === "project id")
          : key === "category"
            ? headers.find((h) => normalized(h) === "category")
            : undefined);
      return h ? [[key, h]] : [];
    }),
  );
}
export function parseProjectCSV(source: string, mapping?: ColumnMapping) {
  const rows = readCSV(source);
  if (rows.length < 2)
    throw Error("CSV needs headers and at least one project.");
  const headers = rows.shift()!.map((h) => h.trim());
  if (new Set(headers).size !== headers.length)
    throw Error("CSV column names must be unique.");
  const map = mapping || defaultMapping(headers);
  const mapped = Object.values(map).filter(Boolean);
  if (
    !map.externalId ||
    new Set(mapped).size !== mapped.length ||
    mapped.some((h) => !headers.includes(h!))
  )
    throw Error("Map RUPTL Code and use each source column only once.");
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const patch: ImportPatch = {};
    try {
      if (cells.length !== headers.length)
        throw Error("Cell count does not match headers.");
      for (const [key, column] of Object.entries(map) as [
        ColumnKey,
        string,
      ][]) {
        if (!column || String(key) === "assetCodes") continue;
        const value = cells[headers.indexOf(column)].trim();
        if (!value) continue;
        if (
          key === "capacity" ||
          key === "codYear" ||
          key === "startYear" ||
          key === "stage"
        ) {
          if (!/^\d+(?:\.\d+)?$/.test(value))
            throw Error(`${column} must be numeric (years use YYYY).`);
          const n = Number(value);
          if (!Number.isFinite(n)) throw Error(`${column} must be finite.`);
          if (key === "stage" && (!Number.isInteger(n) || n < 0 || n > 10))
            throw Error("Stage must be 0–10 (0 means Not started).");
          patch[key] = n;
        } else if (key === "completed") {
          if (!/^(true|false|yes|no|1|0)$/i.test(value))
            throw Error("Completed must be true or false.");
          patch.completed = /^(true|yes|1)$/i.test(value);
        } else if (key === "links" || key === "linkLabels") {
          let values: string[];
          if (/^\[\s*(?:"|\])/.test(value)) {
            const list: unknown = JSON.parse(value);
            if (!Array.isArray(list) || list.some((v) => typeof v !== "string"))
              throw Error(`${column} must contain a list of text values.`);
            values = list.map((v) => v.trim());
          } else values = value.split(";").map((v) => v.trim());
          // Link/label positions are significant.
          if (key !== "linkLabels") values = values.filter(Boolean);
          patch[key] = values;
        } else if (key === "customValues") {
          patch.customValues = JSON.parse(value);
        } else if (key === "category") patch.category = value;
        else patch[key] = value;
      }
      if (!patch.externalId) throw Error("RUPTL Code is required.");
      if (seen.has(patch.externalId))
        throw Error(`Duplicate RUPTL Code ${patch.externalId}.`);
      seen.add(patch.externalId);
      return { row: index + 2, patch };
    } catch (e) {
      throw Error(`Row ${index + 2}: ${(e as Error).message}`);
    }
  });
}
export function mergeImportedProject(
  existing: ProjectPayload | undefined,
  patch: ImportPatch,
  updateStages: boolean,
): ProjectPayload {
  const {
    stage: requestedStage,
    completed: requestedCompleted,
    ...fields
  } = patch;
  const {
    stage: oldStage,
    completed: oldCompleted,
    ...previous
  } = existing ? normalizeProjectPayload(existing) : {};
  void oldStage;
  void oldCompleted;
  if (
    patch.links &&
    JSON.stringify(patch.links) !== JSON.stringify(existing?.links)
  )
    if (patch.linkLabels === undefined) fields.linkLabels = [];
  const previousValues = Object.fromEntries(
    Object.entries(previous).filter(([key]) =>
      Object.hasOwn(projectSchema.shape, key),
    ),
  );
  const value = projectSchema.parse({ ...previousValues, ...fields });
  const stage =
    existing && !updateStages
      ? existing.stage
      : (requestedStage ?? existing?.stage ?? 0);
  const completed =
    existing && !updateStages
      ? existing.completed
      : (requestedCompleted ??
        (stage === existing?.stage ? existing.completed : false));
  if (completed && stage !== 10)
    throw Error("Completed projects must be at stage 10.");
  const workflowChanged =
    existing &&
    (stage !== existing.stage ||
      completed !== existing.completed ||
      value.startYear !== existing.startYear ||
      value.codYear !== existing.codYear);
  return {
    ...previous,
    ...value,
    stage,
    completed,
    ...(workflowChanged
      ? {
          progressReviewedAt: null,
          progressReviewedBy: null,
          progressReviewNote: "",
        }
      : {}),
  };
}
function* projectCSVLines(projects: ProjectPayload[]) {
  const keys = Object.keys(CSV_COLUMNS) as ColumnKey[];
  const safe = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  yield Object.values(CSV_COLUMNS).map(safe).join(",");
  for (const project of projects) {
    yield keys
      .map((key) =>
        safe(
          key === "links" || key === "linkLabels" || key === "customValues"
            ? JSON.stringify(project[key])
            : project[key],
        ),
      )
      .join(",");
  }
}
export function exportProjectCSV(projects: ProjectPayload[]) {
  return [...projectCSVLines(projects)].join("\r\n");
}
export function projectCSVStream(projects: ProjectPayload[]) {
  const rows = projectCSVLines(projects);
  const encoder = new TextEncoder();
  let first = true,
    pending: Uint8Array = new Uint8Array(),
    offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= pending.length) {
        const next = rows.next();
        if (next.done) {
          controller.close();
          return;
        }
        pending = encoder.encode((first ? "" : "\r\n") + next.value);
        first = false;
        offset = 0;
      }
      const end = Math.min(offset + 65536, pending.length);
      controller.enqueue(pending.slice(offset, end));
      offset = end;
    },
    cancel() {
      rows.return();
    },
  });
}

export const CSV_FIELD_HELP: Record<ColumnKey, string> = {
  customValues:
    "JSON object of template field keys and stable option IDs; blank preserves existing values.",
  externalId:
    "Required. Stable RUPTL Code, up to 80 letters, digits, periods, underscores or hyphens.",
  name: "Required for new projects. Up to 160 characters.",
  category: "Pembangkit, Transmisi or Gardu Induk. Optional when unknown.",
  scope: "Optional project scope, up to 500 characters.",
  voltage:
    "Optional text or number, up to 120 characters; for example 150, 150 kV or 275/150 kV.",
  capacity:
    "Non-negative number. A capacity unit is required when capacity is provided.",
  unit: "MW, MVA, kms, MWh, MWp, MWac or a custom unit (up to 30 characters).",
  codYear:
    "New/changed assignments use 2026–2040; unchanged historical values remain valid. Must be on or after Start year.",
  stage:
    "0 means Not started; 1–10 follow the shared workflow. Existing progress changes require the workflow checkbox.",
  startYear: "Optional year from 1900 to 2200. Use years only.",
  description: "Optional project description, up to 2,000 characters.",
  location:
    "Kalimantan Barat, Kalimantan Tengah, Kalimantan Selatan, Kalimantan Timur or Kalimantan Utara. Existing imported locations are retained.",
  links:
    "Up to 20 HTTP(S) project URLs. Use semicolon-separated entries or an exported list.",
  linkLabels:
    "Optional labels in the same order and count as Project links. Exported lists preserve punctuation and empty labels.",
  completed:
    "true or false. Completed projects must be at stage 10. Existing completion changes require the workflow checkbox.",
};
