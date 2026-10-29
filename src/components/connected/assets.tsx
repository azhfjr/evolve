"use client";
import { useState, useRef, useEffect, useId } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FieldHint } from "../field-hint";
import { BoardModal } from "../board-room/modal";
import { AppSelect } from "../app-select";
import {
  PRIMARY_CATEGORIES,
  CAPACITY_UNITS,
  KALIMANTAN_PROVINCES,
} from "@/lib/board-room/model";
import { ASSET_HEADERS, assetCSVCell, type Asset } from "@/lib/assets/model";
import { useConnectedData, connectedRequest, changed } from "./data";
import { FormDraftRecovery } from "./draft-recovery";
import { useURLState } from "./url-state";
import { ProjectPicker } from "./project-picker";
export function ReadOnlyAsset({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const r = useConnectedData<{ items: Asset[] }>(
    "/api/board-room/assets?id=" + encodeURIComponent(asset.id),
  );
  const current = r.data?.items.find((a) => a.id === asset.id) ?? asset;
  const missing = !!r.data && !r.data.items.some((a) => a.id === asset.id);
  return (
    <BoardModal title={current.code + " — " + current.name} onClose={onClose}>
      <div className="connected-form">
        {r.busy && !r.data && <p role="status">Refreshing asset details…</p>}
        {r.error && (
          <p role="alert">
            Unable to refresh. These are the last recorded values. {r.error}
            <button onClick={r.retry}>Retry</button>
          </p>
        )}
        {missing ? (
          <p role="alert">This asset is no longer available.</p>
        ) : (
          <>
            <dl className="connected-form">
              <dt>Asset name</dt>
              <dd>{current.name}</dd>
              <dt>RUPTL code</dt>
              <dd>{current.code}</dd>
              <dt>Primary category</dt>
              <dd>{current.category || "Not set"}</dd>
              <dt>Capacity</dt>
              <dd>
                {current.capacity === null
                  ? "Not set"
                  : `${current.capacity.toLocaleString("en-GB")} ${current.unit}`}
              </dd>
              <dt>Location</dt>
              <dd>{current.location || "Not set"}</dd>
              <dt>Voltage</dt>
              <dd>{current.voltage || "Not set"}</dd>
              <dt>Project</dt>
              <dd>
                {current.projectId ? (
                  <Link href={"/board-room/projects/" + current.projectId}>
                    {current.projectName || "Open project"}
                  </Link>
                ) : (
                  "Unassigned"
                )}
              </dd>
            </dl>
            <Link href={"/board-room?section=assets&asset=" + current.id}>
              Open in database
            </Link>
          </>
        )}
      </div>
    </BoardModal>
  );
}
export function AssetEditor({
  asset,
  email,
  readOnly = false,
  onClose,
  onSaved,
  onReassigned,
}: {
  onReassigned?: (asset: Asset) => void;
  asset: Asset | null;
  readOnly?: boolean;
  email: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hintId = useId();
  const formRef = useRef<HTMLFormElement>(null),
    clearDraft = useRef<() => void>(() => {});
  const [draftVersion, setDraftVersion] = useState(asset?.version);
  const [projectId, setProjectId] = useState<string | null>(
      asset?.projectId ?? null,
    ),
    [category, setCategory] = useState<string>(asset?.category ?? "Pembangkit"),
    [location, setLocation] = useState(asset?.location || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (asset && !draftVersion)
        throw new Error(
          "This older draft has no record version. Copy your changes and reload before saving.",
        );
      await connectedRequest("/api/board-room/assets", {
        action: "save",
        id: asset?.id,
        version: draftVersion,
        values: {
          code: f.get("code"),
          name: f.get("name"),
          category,
          capacity: f.get("capacity") === "" ? null : Number(f.get("capacity")),
          unit: f.get("unit"),
          location,
          voltage: f.get("voltage"),
          projectId: asset ? asset.projectId : projectId,
        },
      });
      clearDraft.current();
      changed();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reassign() {
    if (
      !asset ||
      !confirm(
        `Move ${asset.code} from ${asset.projectName || "its current project"} to the selected project?`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await connectedRequest<{ asset: Asset }>(
        "/api/board-room/assets",
        {
          action: "assign",
          id: asset.id,
          version: asset.version,
          projectId,
        },
      );
      setDraftVersion(response.asset.version);
      changed();
      if (onReassigned) onReassigned(response.asset);
      else onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <BoardModal
      title={readOnly ? "Asset details" : asset ? "Edit asset" : "Add asset"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form ref={formRef} onSubmit={save} className="connected-form">
        {!readOnly && (
          <FormDraftRecovery
            email={email}
            kind="asset"
            version={draftVersion}
            id={asset?.id ?? "new"}
            formRef={formRef}
            extra={{ category, location, projectId }}
            onReady={(clear) => {
              clearDraft.current = clear;
            }}
            onRestore={(v) => {
              if (asset)
                setDraftVersion(
                  typeof v.__baseVersion === "number" ? v.__baseVersion : 0,
                );
              if (typeof v.category === "string") setCategory(v.category);
              if (typeof v.location === "string") setLocation(v.location);
              if (typeof v.projectId === "string" || v.projectId === null)
                setProjectId(v.projectId as string | null);
            }}
          />
        )}
        <fieldset disabled={busy || readOnly}>
          <div className="br-form-grid">
            <label>
              RUPTL code
              <input
                name="code"
                aria-label="RUPTL code"
                aria-describedby={`${hintId}-code`}
                required
                maxLength={80}
                defaultValue={asset?.code}
                readOnly={!!asset}
              />
              <FieldHint id={`${hintId}-code`}>
                Required unique RUPTL identifier. Start with a letter or number.
                Use letters, numbers, dots, underscores or hyphens. The code
                cannot be changed after creation.
              </FieldHint>
            </label>
            <label>
              Asset name
              <input
                name="name"
                aria-label="Asset name"
                aria-describedby={`${hintId}-name`}
                required
                maxLength={160}
                defaultValue={asset?.name}
              />
              <FieldHint id={`${hintId}-name`}>
                Required. Use a descriptive technical asset name.
              </FieldHint>
            </label>
            <label>
              Primary category
              <AppSelect
                aria-label="Primary category"
                aria-describedby={`${hintId}-primary-category`}
                value={category}
                onValueChange={setCategory}
              >
                {PRIMARY_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </AppSelect>
              <FieldHint id={`${hintId}-primary-category`}>
                Required. Select Pembangkit, Transmisi or Gardu Induk.
              </FieldHint>
            </label>
            <label>
              Location
              <AppSelect
                aria-label="Location"
                aria-describedby={`${hintId}-location`}
                value={location}
                onValueChange={setLocation}
              >
                <option value="">Not set</option>
                {location &&
                  !KALIMANTAN_PROVINCES.includes(
                    location as (typeof KALIMANTAN_PROVINCES)[number],
                  ) && <option>{location}</option>}
                {KALIMANTAN_PROVINCES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </AppSelect>
              <FieldHint id={`${hintId}-location`}>
                Optional. Choose the recorded Kalimantan province; existing
                locations are preserved.
              </FieldHint>
            </label>
            <label>
              Capacity
              <input
                name="capacity"
                aria-label="Capacity"
                aria-describedby={`${hintId}-capacity`}
                type="number"
                min="0"
                step="any"
                defaultValue={asset?.capacity ?? ""}
              />
              <FieldHint id={`${hintId}-capacity`}>
                Optional nonnegative value. Enter its unit alongside the
                capacity.
              </FieldHint>
            </label>
            <label>
              Capacity unit
              <input
                name="unit"
                aria-label="Capacity unit"
                aria-describedby={`${hintId}-unit`}
                list="asset-units"
                maxLength={30}
                defaultValue={asset?.unit}
              />
              <FieldHint id={`${hintId}-unit`}>
                Required when capacity is set. Select a suggested unit or enter
                a custom unit.
              </FieldHint>
              <datalist id="asset-units">
                {CAPACITY_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            <label>
              Voltage
              <input
                name="voltage"
                aria-label="Voltage"
                aria-describedby={`${hintId}-voltage`}
                maxLength={120}
                defaultValue={asset?.voltage}
              />
              <FieldHint id={`${hintId}-voltage`}>
                Optional. Include the unit, for example 150 kV.
              </FieldHint>
            </label>
            <div>
              <ProjectPicker
                value={projectId}
                onChange={setProjectId}
                describedBy={`${hintId}-project`}
              />
              <FieldHint id={`${hintId}-project`}>
                Optional. An asset belongs to at most one project. Existing
                assignments change only through Confirm reassignment.
              </FieldHint>
            </div>
          </div>
          {asset && projectId !== asset.projectId && (
            <p>
              Project assignments save separately.{" "}
              <button type="button" onClick={() => void reassign()}>
                Confirm reassignment
              </button>
            </p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <footer className="connected-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {!readOnly && (
            <button className="br-primary" disabled={busy}>
              Save asset
            </button>
          )}
          {!readOnly && asset && !asset.projectId && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Delete this unassigned asset?")) return;
                setBusy(true);
                try {
                  await connectedRequest("/api/board-room/assets", {
                    action: "delete",
                    id: asset.id,
                    version: asset.version,
                  });
                  changed();
                  onSaved();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete asset
            </button>
          )}
        </footer>
      </form>
    </BoardModal>
  );
}
type Preview = {
  token: string;
  total: number;
  counts: { new: number; updated: number; unchanged: number };
  rows: {
    row: number;
    code: string;
    kind: string;
    reassignment: boolean;
    fields?: { field: string; before: unknown; after: unknown }[];
    values: Asset;
  }[];
  requiresAssignmentConfirmation: boolean;
  committed?: boolean;
};
function AssetImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [source, setSource] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewPage, setPreviewPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [clear, setClear] = useState<
      Record<
        string,
        ("capacity" | "unit" | "location" | "voltage" | "projectId")[]
      >
    >({});
  async function run(action: "preview" | "commit") {
    setBusy(true);
    setError("");
    try {
      const result = await connectedRequest<Preview>(
        "/api/board-room/assets/imports",
        {
          action,
          source,
          mapping,
          clear,
          token: preview?.token,
          confirmAssignments: confirmed,
        },
      );
      setPreview(result);
      if (result.committed) {
        changed();
        toast.success("Assets imported");
        onSaved();
      }
    } catch (e) {
      setError((e as Error).message);
      if (action === "commit") setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  const headers =
    source
      .split(/\r?\n/)[0]
      ?.split(",")
      .map((s) => s.trim()) ?? [];
  function download() {
    const csv =
      "Row,RUPTL Code,Result\n" +
      preview!.rows
        .map((r) => [r.row, r.code, r.kind].map(assetCSVCell).join(","))
        .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "asset-import-result.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <BoardModal title="Import assets" onClose={onClose}>
      <div className="connected-form">
        <p>
          Merge by unique RUPTL code. Blank cells preserve existing values;
          assets absent from this CSV remain unchanged. At most 5,000 rows and a
          4 MiB encoded request.
        </p>
        <input
          aria-label="Choose asset CSV"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setSource(await f.text());
              setPreview(null);
              setMapping({});
              setClear({});
            }
          }}
        />
        {source && (
          <details>
            <summary>Map columns</summary>
            {ASSET_HEADERS.map((header, i) => (
              <label key={header}>
                {header}
                <AppSelect
                  aria-label={`Map ${header}`}
                  value={
                    mapping[
                      [
                        "code",
                        "name",
                        "category",
                        "capacity",
                        "unit",
                        "location",
                        "voltage",
                        "projectId",
                      ][i]
                    ] ?? header
                  }
                  onValueChange={(v) => {
                    setMapping((m) => ({
                      ...m,
                      [[
                        "code",
                        "name",
                        "category",
                        "capacity",
                        "unit",
                        "location",
                        "voltage",
                        "projectId",
                      ][i]]: v,
                    }));
                    setPreview(null);
                  }}
                >
                  <option value="">Not mapped</option>
                  {Array.from(new Set([...headers, header])).map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </AppSelect>
              </label>
            ))}
          </details>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {preview && (
          <>
            <p role="status">
              {preview.counts.new} new · {preview.counts.updated} updated ·{" "}
              {preview.counts.unchanged} unchanged
            </p>
            <div className="connected-table">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>RUPTL code</th>
                    <th>Result</th>
                    <th>Project assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .slice((previewPage - 1) * 100, previewPage * 100)
                    .map((r) => (
                      <tr key={r.code}>
                        <td>{r.row}</td>
                        <td>{r.code}</td>
                        <td>
                          {r.kind}
                          {r.fields?.map((f) => (
                            <small key={f.field}>
                              {f.field}: {String(f.before ?? "—")} →{" "}
                              {String(f.after ?? "—")}
                            </small>
                          ))}
                          <details>
                            <summary>Clear existing fields</summary>
                            {(
                              [
                                "capacity",
                                "unit",
                                "location",
                                "voltage",
                                "projectId",
                              ] as const
                            ).map((field) => (
                              <label key={field}>
                                <input
                                  type="checkbox"
                                  checked={
                                    clear[r.code]?.includes(field) ?? false
                                  }
                                  onChange={(e) => {
                                    setClear((v) => ({
                                      ...v,
                                      [r.code]: e.target.checked
                                        ? [...(v[r.code] ?? []), field]
                                        : (v[r.code] ?? []).filter(
                                            (f) => f !== field,
                                          ),
                                    }));
                                    setPreview((v) =>
                                      v ? { ...v, token: "" } : v,
                                    );
                                  }}
                                />
                                {field === "projectId"
                                  ? "Project assignment"
                                  : field}
                              </label>
                            ))}
                          </details>
                        </td>
                        <td>
                          {r.reassignment
                            ? "Reassignment requires confirmation"
                            : r.values.projectId || "Unassigned"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {preview.requiresAssignmentConfirmation && (
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm the assignment changes shown.
              </label>
            )}
            {preview.committed && (
              <button onClick={download}>Download import result</button>
            )}
          </>
        )}
        {preview && (
          <div className="connected-actions">
            <button
              disabled={previewPage === 1}
              onClick={() => setPreviewPage((p) => p - 1)}
            >
              Previous rows
            </button>
            <span>
              Page {previewPage} of{" "}
              {Math.max(1, Math.ceil(preview.total / 100))}
            </span>
            <button
              disabled={previewPage * 100 >= preview.total}
              onClick={() => setPreviewPage((p) => p + 1)}
            >
              Next rows
            </button>
          </div>
        )}
        <footer className="connected-actions">
          <button
            disabled={!source || busy}
            onClick={() => void run("preview")}
          >
            Preview import
          </button>
          {preview && !preview.committed && (
            <button
              className="br-primary"
              disabled={
                busy ||
                !preview.token ||
                (preview.requiresAssignmentConfirmation && !confirmed)
              }
              onClick={() => void run("commit")}
            >
              Confirm import
            </button>
          )}
        </footer>
      </div>
    </BoardModal>
  );
}
export function AssetsWorkspace({
  admin,
  email,
}: {
  admin: boolean;
  email: string;
}) {
  const [projectId, setProjectId] = useURLState("assetProject", ""),
    [scope, setScope] = useURLState("projectScope", ""),
    [unit, setUnit] = useURLState("assetUnit", ""),
    [category, setCategory] = useURLState("assetCategory", "");
  const [q, setQ] = useURLState("assetQuery", ""),
    [page, setPage] = useURLState("assetPage", 1),
    [editor, updateEditor] = useState<Asset | "new" | null>(null),
    [importing, setImporting] = useState(false);
  function setEditor(value: Asset | "new" | null) {
    updateEditor(value);
    const url = new URL(location.href);
    if (value && value !== "new") url.searchParams.set("asset", value.id);
    else url.searchParams.delete("asset");
    history.replaceState(null, "", url);
    window.dispatchEvent(new Event("evolve:context"));
  }
  const r = useConnectedData<{ items: Asset[]; total: number }>(
    `/api/board-room/assets?${new URLSearchParams({ q, page: String(page), unit, category, ...(scope ? { projectScope: scope } : {}), ...(projectId ? { projectId } : {}) })}`,
  );
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("import") === "1") queueMicrotask(() => setImporting(true));
    const id = params.get("asset");
    if (!id) return;
    const abort = new AbortController();
    void connectedRequest<{ items: Asset[] }>(
      "/api/board-room/assets?id=" + encodeURIComponent(id),
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (result.items[0]) setEditor(result.items[0]);
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);
  return (
    <section className="connected-panel">
      <div className="connected-heading">
        <div>
          <h2>Assets database</h2>
          <p>
            Technical records connected to projects. Each asset has one unique
            RUPTL code.
          </p>
        </div>
        {admin && (
          <div className="connected-actions">
            <button className="br-primary" onClick={() => setEditor("new")}>
              Add asset
            </button>
            <button onClick={() => setImporting(true)}>Import assets</button>
          </div>
        )}
      </div>
      <div className="connected-actions">
        <a href="/board-room/asset-upload-template.csv" download>
          Download asset template
        </a>
        <a href="/board-room/asset-upload-example.csv" download>
          Example CSV
        </a>
        <Link href="/board-room?section=quality">Data quality</Link>
      </div>
      {(scope || unit || category || projectId) && (
        <p className="br-note">
          Filtered{" "}
          {projectId ? "to the selected project" : "from portfolio charts"}{" "}
          {unit && ` · ${unit}`} {category && ` · ${category}`}{" "}
          <button
            onClick={() => {
              setScope("");
              setProjectId("");
              setUnit("");
              setCategory("");
              setPage(1);
            }}
          >
            Clear asset filters
          </button>
        </p>
      )}
      <details>
        <summary>Asset field guide</summary>
        <p>
          RUPTL code, name and primary category are required for new assets.
          Capacity is numeric and requires a unit. Project ID is optional; use
          the project’s stable ID from its details. Codes cannot be renamed.
          Blank import cells preserve existing values; assignments never move
          silently.
        </p>
      </details>
      <input
        aria-label="Search assets"
        disabled={r.busy && !r.data}
        placeholder="Search asset name or RUPTL code…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.busy && <p role="status">Loading assets…</p>}
      <div className="connected-table">
        <table>
          <thead>
            <tr>
              {[
                "RUPTL code",
                "Asset",
                "Category",
                "Capacity",
                "Location",
                "Voltage",
                "Project",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.data?.items.map((a) => (
              <tr key={a.id}>
                <td>{a.code}</td>
                <td>
                  <button onClick={() => setEditor(a)}>{a.name}</button>
                </td>
                <td>{a.category || "Not set"}</td>
                <td>
                  {a.capacity ?? "—"} {a.unit}
                </td>
                <td>{a.location || "—"}</td>
                <td>{a.voltage || "—"}</td>
                <td>
                  {a.projectId ? (
                    <Link href={"/board-room/projects/" + a.projectId}>
                      {a.projectName || "Open project"}
                    </Link>
                  ) : (
                    "Unassigned"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!r.busy && r.data?.total === 0 && (
        <p>
          No assets found.{" "}
          {admin
            ? "Add an asset or import the CSV template."
            : "An administrator can add assets."}
        </p>
      )}
      <div className="connected-actions">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          {r.data?.total ?? "…"} assets · Page {page}
        </span>
        <button
          disabled={page * 50 >= (r.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      {editor && !admin && editor !== "new" && (
        <ReadOnlyAsset asset={editor} onClose={() => setEditor(null)} />
      )}
      {editor && (admin || editor === "new") && (
        <AssetEditor
          email={email}
          readOnly={!admin}
          onReassigned={(asset) => {
            setEditor(asset);
            r.retry();
          }}
          asset={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            r.retry();
          }}
        />
      )}
      {importing && (
        <AssetImport onClose={() => setImporting(false)} onSaved={r.retry} />
      )}
    </section>
  );
}
