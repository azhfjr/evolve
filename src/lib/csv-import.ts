import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n/core";
import { validationSummary } from "./i18n/validation";
import { taskFields } from "./validation";
import { taskRangeError } from "./task-range";
import type { z } from "zod";
import type { Member, Project } from "./types";
export type ImportedTask = z.infer<typeof taskFields>;
export function parseCSV(source: string): string[][] {
  if (source.length > 600000 || source.includes("\0"))
    throw new Error("CSV maksimal 500 KB dalam format UTF-8.");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  const cell = () => {
    row.push(value);
    value = "";
    closed = false;
  };
  const line = () => {
    cell();
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
    if (rows.length > 101)
      throw new Error(
        "Maksimal 100 task per impor. Pisahkan CSV menjadi beberapa bagian.",
      );
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
      continue;
    }
    if (c === '"') {
      if (value) throw new Error("Tanda kutip CSV tidak valid.");
      quoted = true;
    } else if (c === ",") cell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      line();
    } else if (closed) {
      if (!/\s/.test(c))
        throw new Error("Isi setelah tanda kutip CSV tidak valid.");
    } else value += c;
  }
  if (quoted) throw new Error("Tanda kutip CSV belum ditutup.");
  if (value || row.length || closed) line();
  return rows;
}
const columns: Record<string, string> = {
  title: "title",
  judul: "title",
  description: "description",
  deskripsi: "description",
  status: "status",
  priority: "priority",
  prioritas: "priority",
  assignee: "assignee",
  "penanggung jawab": "assignee",
  "start date": "startDate",
  "tanggal mulai": "startDate",
  "end date": "dueDate",
  "tanggal selesai": "dueDate",
  "due date": "dueDate",
  tenggat: "dueDate",
  "due time": "dueTime",
  "jam tenggat": "dueTime",
  timezone: "dueTimeZone",
  "zona waktu": "dueTimeZone",
  project: "project",
  proyek: "project",
  labels: "labels",
  label: "labels",
};
export function previewCSV(
  source: string,
  members: Member[],
  projects: Project[],
  defaultProject: string | null = null,
  locale: Locale = DEFAULT_LOCALE,
) {
  const t = getTranslator(locale);
  const rows = parseCSV(source.replace(/^\ufeff/, ""));
  if (rows.length < 2)
    throw new Error("CSV perlu berisi judul kolom dan minimal satu task.");
  const headers = rows[0].map((header) => columns[header.trim().toLowerCase()]);
  if (headers.some((header) => !header))
    throw new Error(
      "Ada kolom yang tidak didukung. Gunakan format contoh CSV.",
    );
  if (new Set(headers).size !== headers.length)
    throw new Error("Kolom CSV tidak boleh berulang.");
  if (!headers.includes("title"))
    throw new Error("Kolom Title atau Judul wajib ada.");
  const tasks: ImportedTask[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    try {
      if (cells.length !== headers.length)
        throw new Error("Jumlah kolom tidak cocok dengan judul kolom.");
      const raw = Object.fromEntries(
        headers.map((key, i) => [key, cells[i].trim()]),
      );
      let projectId = defaultProject;
      if (raw.project) {
        const matching = projects.filter(
          (p) =>
            p.id === raw.project ||
            p.name.toLowerCase() === raw.project.toLowerCase(),
        );
        if (matching.length !== 1)
          throw new Error(
            "Project tidak ditemukan atau namanya ambigu. Gunakan nama unik atau ID project.",
          );
        projectId = matching[0].id;
      }
      const assignee = raw.assignee?.toLowerCase() || null;
      if (assignee && !members.some((m) => m.email === assignee && !m.disabled))
        throw new Error("Penanggung jawab harus email anggota aktif.");
      const parsed = taskFields.safeParse({
        title: raw.title,
        description: raw.description || "",
        status: raw.status || "todo",
        priority: raw.priority || "none",
        assignee,
        projectId,
        ...(headers.includes("startDate")
          ? { startDate: raw.startDate || null }
          : {}),
        dueDate: raw.dueDate || null,
        dueTime: raw.dueTime || null,
        dueTimeZone: raw.dueTimeZone || null,
        labels: raw.labels
          ? raw.labels
              .split(";")
              .map((label) => label.trim())
              .filter(Boolean)
          : [],
        checklist: [],
      });
      if (!parsed.success)
        throw new Error(validationSummary(parsed.error.issues, locale));
      const rangeError = taskRangeError(parsed.data);
      if (rangeError) throw new Error(rangeError);
      if (parsed.data.dueTime && !parsed.data.dueDate)
        throw new Error("Jam tenggat memerlukan tanggal.");
      tasks.push(parsed.data);
    } catch (e) {
      errors.push({ row: rowNumber, message: t((e as Error).message) });
    }
  });
  return { tasks, errors, total: rows.length - 1 };
}
export const CSV_EXAMPLE =
  'Title,Description,Status,Priority,Assignee,Start date,End date,Due time,Project\r\n"Siapkan laporan","Ringkas progres mingguan",todo,high,,,,,\r\n';
