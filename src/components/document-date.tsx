"use client";
import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "./ui";
import { changed } from "./connected/data";
import type { AttachmentInfo } from "@/lib/attachment-types";
export function formatDocumentDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
export function DocumentDateInput({
  value,
  onChange,
  disabled = false,
  label = "Document date",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const hintId = useId();
  return (
    <label className="document-date-input">
      Document date
      <input
        aria-label={label}
        aria-describedby={hintId}
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <small id={hintId} className="field-hint">
        Optional. The date on the document, separate from its upload time.
      </small>
    </label>
  );
}
type DateEdit = {
  file: AttachmentInfo;
  onChanged: (file: AttachmentInfo) => void;
};
const DateEditorContext = createContext<((selection: DateEdit) => void) | null>(
  null,
);
/** Keep unfinished metadata outside refreshed rows, including moves to Undated. */
export function DocumentDateProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<DateEdit | null>(null);
  return (
    <DateEditorContext.Provider value={setSelection}>
      {children}
      {selection && (
        <DocumentDateEditor
          key={selection.file.id}
          {...selection}
          onClose={() => setSelection(null)}
        />
      )}
    </DateEditorContext.Provider>
  );
}
export function DocumentDateControl({
  file,
  editable,
  onChanged,
}: DateEdit & { editable: boolean }) {
  const edit = useContext(DateEditorContext),
    [open, setOpen] = useState(false);
  return (
    <div className="document-date-control">
      <span>
        Document date:{" "}
        {file.documentDate
          ? formatDocumentDate(file.documentDate)
          : "Not assigned"}
      </span>
      {editable && (
        <button
          type="button"
          aria-label={`Edit document date for ${file.filename}`}
          onClick={() => (edit ? edit({ file, onChanged }) : setOpen(true))}
        >
          Edit document date
        </button>
      )}
      {open && (
        <DocumentDateEditor
          file={file}
          onChanged={onChanged}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function DocumentDateEditor({
  file,
  onChanged,
  onClose,
}: DateEdit & { onClose: () => void }) {
  const [date, setDate] = useState(file.documentDate ?? ""),
    [base, setBase] = useState(file.documentVersion),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  return (
    <Modal
      open
      title="Edit document date"
      description={file.filename}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="connected-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const response = await fetch(
              `/api/attachments/${file.id}/metadata`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  documentDate: date || null,
                  expectedDocumentVersion: base,
                }),
              },
            );
            const body = await response.json();
            if (!response.ok) {
              setConflict(response.status === 409);
              throw Error(body.error || "Unable to save document date.");
            }
            onChanged(body);
            changed();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <DocumentDateInput value={date} onChange={setDate} disabled={busy} />
        <p className="field-hint">
          Changing this date does not change upload history or document review
          validity. Clear the field to move the document to Undated.
        </p>
        {error && <p role="alert">{error}</p>}
        {conflict && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const response = await fetch(
                  `/api/attachments/${file.id}/metadata`,
                  { cache: "no-store" },
                );
                const current = await response.json();
                if (!response.ok)
                  throw Error(current.error || "Unable to refresh metadata.");
                setBase(current.documentVersion);
                onChanged(current);
                setConflict(false);
                setError(
                  `Latest saved date: ${current.documentDate ? formatDocumentDate(current.documentDate) : "Not assigned"}. Your input is preserved. Review it before saving.`,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Refresh metadata and keep my input
          </button>
        )}
        <footer className="connected-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="br-primary" disabled={busy || conflict || !base}>
            {busy ? "Saving…" : "Save date"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
