"use client";
import { ProjectCSVGuide } from "../connected/project-csv-guide";
import { CSVFieldGuide } from "./csv-field-guide";
import { AppSelect } from "../app-select";
import { useState } from "react";
import {
  mappingStorageKey,
  readSavedMapping,
  serializeSavedMapping,
  mappingForHeaders,
  type SavedMapping,
} from "@/lib/board-room/import-mappings";
import {
  BOARD_IMPORT_LIMIT,
  IMPORT_SIZE_ERROR,
  encodeBoardRequest,
} from "@/lib/board-room/transport";
import { toast } from "sonner";
import {
  CSV_COLUMNS,
  defaultMapping,
  readCSV,
  type ColumnMapping,
  type ColumnKey,
} from "@/lib/board-room/csv";
import { boardRequest } from "./api";
import { BoardModal } from "./modal";
type Preview = {
  token: string;
  counts: { new: number; updated: number; unchanged: number };
  rows: {
    row: number;
    externalId: string;
    name: string;
    kind: string;
    fields: { field: string; before: string; after: string }[];
  }[];
  total: number;
  page: number;
  pageSize: number;
  requiresReason?: boolean;
};
export function ImportDialog({
  onClose,
  onSaved,
  actorEmail = "",
}: {
  onClose: () => void;
  onSaved: () => void;
  actorEmail?: string;
}) {
  const [legacy, setLegacy] = useState(false);
  const [source, setSource] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<ColumnMapping>({}),
    [updateStages, setUpdateStages] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [stageReason, setStageReason] = useState("");
  const [savedMapping, setSavedMapping] = useState<SavedMapping | null>(null);
  const [mappingName, setMappingName] = useState("My project list");
  function saveMapping() {
    try {
      const value = serializeSavedMapping(mappingName, mapping);
      window.localStorage.setItem(mappingStorageKey(actorEmail), value);
      setSavedMapping(readSavedMapping(value));
      toast.success("Personal mapping saved on this browser");
    } catch {
      setError(
        "Choose a mapping name, map RUPTL Code and use each source column only once. Browser storage must be available.",
      );
    }
  }
  async function file(file: File | undefined) {
    if (!file) return;
    setError("");
    setPreview(null);
    setSource("");
    try {
      if (file.size > BOARD_IMPORT_LIMIT) throw Error(IMPORT_SIZE_ERROR);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const rows = readCSV(text);
      if (rows.length < 2)
        throw Error("Choose a CSV with headers and project rows.");
      const columns = rows[0].map((h) => h.trim());
      setSource(text);
      setHeaders(columns);
      setMapping({
        ...defaultMapping(columns),
        ...(!legacy && columns.includes("Project ID")
          ? { externalId: "Project ID" }
          : {}),
        ...(columns.includes("Asset RUPTL codes")
          ? { assetCodes: "Asset RUPTL codes" }
          : {}),
      });
      if (actorEmail) {
        try {
          const saved = readSavedMapping(
            window.localStorage.getItem(mappingStorageKey(actorEmail)),
          );
          setSavedMapping(saved);
          if (saved) setMappingName(saved.name);
        } catch {
          setSavedMapping(null);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(commit: boolean, previewPage = 1) {
    if (updateStages && !stageReason.trim()) {
      setError("Provide a reason for CSV stage updates before previewing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Reserve the commit token so a preview that fits can also be committed.
      encodeBoardRequest({
        action: legacy ? "importCommit" : "canonicalCommit",
        source,
        mapping,
        previewPage,
        updateStages,
        reason: updateStages ? stageReason : undefined,
        token: "0".repeat(64),
      });
      const result = await boardRequest<Preview>({
        action: legacy
          ? commit
            ? "importCommit"
            : "importPreview"
          : commit
            ? "canonicalCommit"
            : "canonicalPreview",
        source,
        mapping,
        previewPage,
        updateStages,
        reason: updateStages ? stageReason : undefined,
        token: commit ? preview?.token : undefined,
      });
      if (commit) {
        toast.success(
          `Imported ${result.counts.new} new and ${result.counts.updated} updated projects`,
        );
        onSaved();
      } else setPreview(result);
    } catch (e) {
      setError((e as Error).message);
      if (commit) setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  const ignored = headers.filter((h) => !Object.values(mapping).includes(h));
  return (
    <BoardModal title="Import project CSV" onClose={onClose}>
      <div className="br-dialog-body">
        <p className="br-note">
          Merge by stable Project ID. Leave Project ID blank for new projects.
          Assets use semicolon-separated RUPTL codes. Projects absent from the
          file stay in the database. Blank cells preserve existing fields.
          Encoded requests must fit within 4 MiB, up to 5,000 rows.
        </p>
        <p className="br-note">
          Current stage accepts 0 (Not started) to 10. Completed uses true or
          false and requires stage 10. Project links and link labels accept
          semicolon-separated entries or exported lists. Link labels follow link
          order. Document validity is reviewed in the app.
        </p>
        <label>
          <input
            type="checkbox"
            checked={legacy}
            onChange={(e) => {
              setLegacy(e.target.checked);
              setPreview(null);
            }}
          />
          Legacy CSV mode (match existing projects by former RUPTL code)
        </label>
        {legacy ? <CSVFieldGuide /> : <ProjectCSVGuide />}
        <label className="br-file-label">
          Choose project CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void file(e.target.files?.[0])}
          />
        </label>
        <p>
          <a href="/board-room/project-upload-template.csv" download>
            Blank CSV template
          </a>{" "}
          ·{" "}
          <a href="/board-room/project-upload-example.csv" download>
            Example CSV
          </a>
        </p>
        {source && (
          <>
            <h3>Map columns</h3>
            {actorEmail && (
              <>
                <div className="br-mapping-actions">
                  <label>
                    Personal mapping name
                    <input
                      maxLength={60}
                      value={mappingName}
                      disabled={busy}
                      onChange={(e) => setMappingName(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !mapping.externalId}
                    onClick={saveMapping}
                  >
                    Save personal mapping
                  </button>
                  {savedMapping && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setMapping(
                            mappingForHeaders(savedMapping.mapping, headers),
                          );
                          setPreview(null);
                          toast.success(
                            `Applied ${savedMapping.name}; review the mapped columns before previewing`,
                          );
                        }}
                      >
                        Apply saved mapping
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          try {
                            window.localStorage.removeItem(
                              mappingStorageKey(actorEmail),
                            );
                            setSavedMapping(null);
                          } catch {
                            setError(
                              "Personal mapping could not be removed from this browser.",
                            );
                          }
                        }}
                      >
                        Forget mapping
                      </button>
                    </>
                  )}
                </div>
                <p className="br-note br-personal-mapping-note">
                  Stored for your account on this browser only. Saved mappings
                  never enable stage overrides and only apply to columns present
                  in the selected file.
                </p>
              </>
            )}
            <div className="br-form-grid">
              {Object.entries(
                legacy
                  ? CSV_COLUMNS
                  : {
                      ...CSV_COLUMNS,
                      externalId: "Project ID",
                      assetCodes: "Asset RUPTL codes",
                    },
              )
                .filter(([key]) => key !== "scope")
                .map(([key, label]) => (
                  <label key={key}>
                    {label}
                    {key === "externalId" ? " *" : ""}
                    <AppSelect
                      aria-label={`Map ${label}`}
                      value={mapping[key as ColumnKey | "assetCodes"] ?? ""}
                      disabled={busy}
                      onValueChange={(value) => {
                        setMapping({
                          ...mapping,
                          [key]: value || undefined,
                        });
                        setPreview(null);
                      }}
                    >
                      <option value="">Do not import</option>
                      {headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </AppSelect>
                  </label>
                ))}
            </div>
            {ignored.length > 0 && (
              <p className="br-note">
                Ignored source columns: {ignored.join(", ")}
              </p>
            )}
            <label className="br-checkbox">
              <input
                type="checkbox"
                checked={updateStages}
                disabled={busy}
                onChange={(e) => {
                  setUpdateStages(e.target.checked);
                  setPreview(null);
                }}
              />
              Update existing stages and completion from this CSV
            </label>
            {updateStages && (
              <label className="br-review-note-field">
                Reason for CSV stage updates
                <textarea
                  aria-label="Reason for CSV stage updates"
                  aria-describedby="br-csv-stage-reason-help"
                  value={stageReason}
                  onChange={(event) => {
                    setStageReason(event.target.value);
                    setPreview(null);
                  }}
                  maxLength={1000}
                  rows={2}
                  disabled={busy}
                  placeholder="Explain the reviewed workflow baseline or reason for changing stages."
                />
                <small id="br-csv-stage-reason-help">
                  Stage jumps and reversals require a reason for every client.
                  Changing this note requires a new preview.
                </small>
              </label>
            )}
          </>
        )}
        {preview && (
          <>
            <div className="br-import-stats">
              <span>
                <b>{preview.counts.new}</b>New
              </span>
              <span>
                <b>{preview.counts.updated}</b>Updated
              </span>
              <span>
                <b>{preview.counts.unchanged}</b>Unchanged
              </span>
            </div>
            <div className="br-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>RUPTL Code</th>
                    <th>Project</th>
                    <th>Exact changes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.kind}</td>
                      <td>{r.externalId}</td>
                      <td>{r.name}</td>
                      <td className="br-import-changes">
                        {r.fields.map((f) => (
                          <div key={f.field}>
                            <b>{f.field}</b>: <span>{f.before}</span> →{" "}
                            <strong>{f.after}</strong>
                          </div>
                        ))}
                        {!r.fields.length && "No changes"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="br-pagination">
              <button
                disabled={busy || preview.page <= 1}
                onClick={() => void submit(false, preview.page - 1)}
              >
                Previous preview page
              </button>
              <button
                disabled={
                  busy || preview.page * preview.pageSize >= preview.total
                }
                onClick={() => void submit(false, preview.page + 1)}
              >
                Next preview page
              </button>
            </div>
            <p className="br-note">
              Page {preview.page} of{" "}
              {Math.max(1, Math.ceil(preview.total / preview.pageSize))};{" "}
              {preview.total} total rows. Confirm only after reviewing these
              changes. CSV cannot mark projects valid.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="br-error">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        {preview ? (
          <button
            className="br-primary"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {busy ? "Importing…" : "Confirm import"}
          </button>
        ) : (
          <button
            className="br-primary"
            disabled={!source || busy}
            onClick={() => void submit(false)}
          >
            {busy ? "Checking…" : "Preview import"}
          </button>
        )}
      </footer>
    </BoardModal>
  );
}
