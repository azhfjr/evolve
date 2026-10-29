"use client";
import { useState } from "react";
import { toast } from "sonner";
import { ProjectPicker } from "../connected/project-picker";
import { useURLState } from "../connected/url-state";
import { useConnectedData, connectedRequest, changed } from "../connected/data";
import { ProjectOptionsInput } from "../project-options-input";
import { ProjectCostEditor } from "../project-cost-editor";
import { BoardModal } from "./modal";
import {
  projectCostOptionsSchema,
  costUnitTotals,
  formatCostAmount,
  type Currency,
} from "@/lib/project-model";
import type { CostSnapshot } from "@/lib/board-room/costs";
function CostEditor({
  record,
  onClose,
  onSaved,
}: {
  record: CostSnapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [options, setOptions] = useState(record.options),
    [active, setActive] = useState(record.options[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(options) !== JSON.stringify(record.options);
  const currency = (record.options
    .flatMap((o) => o.items)
    .find((i) => i.unit === "IDR" || i.unit === "USD")?.unit ??
    "IDR") as Currency;
  const close = () => {
    if (!busy) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  };
  return (
    <BoardModal
      title={
        discard
          ? "Discard unsaved project costs?"
          : "Project costs — " + record.name
      }
      onClose={close}
    >
      {discard ? (
        <div className="connected-form">
          <p>Your cost changes have not been saved.</p>
          <div className="connected-actions">
            <button onClick={() => setDiscard(false)}>Keep editing</button>
            <button onClick={onClose}>Discard changes</button>
          </div>
        </div>
      ) : (
        <form
          className="connected-form project-composer"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const valid = projectCostOptionsSchema.parse(options);
              await connectedRequest(
                "/api/board-room/costs?id=" + record.projectId,
                { version: record.version, options: valid },
              );
              changed();
              toast.success("Project costs saved");
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="field-hint">
            Each option is independent. Monetary values retain two decimals;
            energy rates retain up to six. Totals stay separate by unit.
          </p>
          <fieldset disabled={busy}>
            <ProjectOptionsInput
              value={options}
              onChange={setOptions}
              activeId={active}
              onActiveChange={setActive}
              defaultCurrency={currency}
            />
            <ProjectCostEditor
              value={options}
              onChange={setOptions}
              activeId={active}
              onActiveChange={setActive}
              defaultCurrency={currency}
            />
          </fieldset>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <footer className="connected-actions">
            <button type="button" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="br-primary" disabled={busy}>
              {busy ? "Saving…" : "Save project costs"}
            </button>
          </footer>
        </form>
      )}
    </BoardModal>
  );
}
export function ProjectCostsPanel({
  id,
  admin,
}: {
  id: string;
  admin: boolean;
}) {
  const r = useConnectedData<CostSnapshot>("/api/board-room/costs?id=" + id),
    [editing, setEditing] = useState<CostSnapshot | null>(null);
  function download() {
    if (!r.data) return;
    const cell = (v: string) =>
      '"' + v.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [
      [
        "Project ID",
        "Option ID",
        "Option",
        "Item ID",
        "Item",
        "Unit",
        "Amount",
      ],
      ...r.data.options.flatMap((o) =>
        o.items.map((i) => [
          id,
          o.id,
          o.title,
          i.id,
          i.title,
          i.unit,
          i.amount,
        ]),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-costs.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="br-panel" aria-label="Project costs">
      <header className="br-panel-heading">
        <h2>Project costs</h2>
        <p>
          Grouped options with separate currency and rate totals. Financial
          edits are managed in Board Room.
        </p>
      </header>
      <div className="connected-form">
        {r.busy && !r.data && <p role="status">Loading project costs…</p>}
        {r.error && (
          <p role="alert">
            {r.error}
            <button onClick={r.retry}>Retry</button>
          </p>
        )}
        {r.data && (
          <>
            <div className="connected-actions">
              {admin && (
                <button
                  className="br-primary"
                  disabled={!r.data.enabled || !r.data.version}
                  onClick={() => setEditing(r.data)}
                >
                  Edit project costs
                </button>
              )}
              <button onClick={download}>Export costs CSV</button>
            </div>
            {!r.data.enabled && (
              <p role="status">
                Cost editing is available after the connected project workflow
                is activated.
              </p>
            )}
            {r.data.options.some((o) => o.items.length) ? (
              r.data.options.map((o) => (
                <section className="cost-option-summary" key={o.id}>
                  <h3>{o.title}</h3>
                  <ul className="project-cost-breakdown">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        <span>{i.title}</span>
                        <small>{i.unit}</small>
                        <strong>{formatCostAmount(i.amount, i.unit)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="cost-option-totals">
                    {costUnitTotals(o.items).map((total) => (
                      <strong key={total.unit}>
                        {formatCostAmount(total.amount, total.unit)}
                      </strong>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <p>No costs recorded for this project.</p>
            )}
          </>
        )}
        {editing && (
          <CostEditor
            record={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              r.retry();
            }}
          />
        )}
      </div>
    </section>
  );
}
export function CostsWorkspace({ admin }: { admin: boolean }) {
  const [id, setId] = useURLState("costProject", "");
  return (
    <section className="connected-form">
      <ProjectPicker
        label="Project for costs"
        value={id || null}
        onChange={(id) => setId(id ?? "")}
      />
      {id ? (
        <ProjectCostsPanel key={id} id={id} admin={admin} />
      ) : (
        <div className="br-panel connected-form">
          <h2>Choose a project</h2>
          <p>
            Explore financial options and enter project costs in Board Room.
          </p>
        </div>
      )}
    </section>
  );
}
