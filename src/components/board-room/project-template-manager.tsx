"use client";
import { useTemplateRecovery } from "./template-recovery";
import { useState } from "react";
import { toast } from "sonner";
import { useConnectedData, connectedRequest, changed } from "../connected/data";
import type {
  TemplateView,
  TemplateResult,
} from "@/lib/project-template/service";
import {
  templateDefinitionSchema,
  type TemplateDefinition,
} from "@/lib/project-template/model";
const endpoint = "/api/board-room/project-template";
function TemplateEditor({
  initial,
  actorEmail,
  onSaved,
}: {
  initial: TemplateView;
  actorEmail: string;
  onSaved: () => void;
}) {
  const [definition, setDefinition] = useState<TemplateDefinition>(
      initial.draft ?? initial.definition,
    ),
    [version, setVersion] = useState(initial.version),
    [published, setPublished] = useState(initial.publishedRevision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<TemplateResult | null>(null),
    [saved, setSaved] = useState(
      JSON.stringify(initial.draft ?? initial.definition),
    );
  const dirty = JSON.stringify(definition) !== saved;
  const recovery = useTemplateRecovery(
    actorEmail,
    definition,
    version,
    dirty,
    busy,
    (restored, baseVersion) => {
      setDefinition(restored);
      setVersion(baseVersion);
      setPreview(null);
      setError("");
    },
  );
  function field(
    index: number,
    update: Partial<TemplateDefinition["fields"][number]>,
  ) {
    setDefinition((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, ...update } : f)),
    }));
    setPreview(null);
  }
  async function command(
    action: "saveDraft" | "publish" | "syncPreview" | "syncCommit",
  ) {
    setBusy(true);
    setError("");
    try {
      const body =
        action === "saveDraft"
          ? {
              action,
              version,
              definition: templateDefinitionSchema.parse(definition),
            }
          : action === "publish"
            ? { action, version }
            : action === "syncCommit"
              ? { action, token: preview?.token }
              : { action };
      const r = await connectedRequest<TemplateResult>(endpoint, body);
      if (action === "saveDraft" || action === "publish") setVersion(r.version);
      setPublished(r.publishedRevision);
      if (action === "saveDraft") {
        recovery.clear();
        setSaved(JSON.stringify(definition));
        toast.success("Template draft saved");
      } else if (action === "syncPreview") setPreview(r);
      else if (action === "syncCommit") {
        setPreview(null);
        toast.success(
          `${r.changedProjects} projects synchronized; populated values retained`,
        );
      } else
        toast.success(
          "Template published. Existing projects retain their revision until synchronized.",
        );
      changed();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connected-form template-manager">
      {recovery.banner}
      <p>
        Published revision {published}. Stable field keys and option identities
        preserve project history. Deactivate published fields or options instead
        of removing them.
      </p>
      <p className="field-hint">
        The primary categories Pembangkit, Transmisi and Gardu Induk remain
        independent. Required custom fields apply to new projects and edits to
        custom metadata; synchronization leaves existing unsets intact.
      </p>
      {initial.version !== version && (
        <p role="alert">
          A different template version is available. Your edits remain here.
          Copy them before reloading.
          <button
            disabled={busy}
            onClick={() => {
              recovery.clear();
              setDefinition(initial.draft ?? initial.definition);
              setVersion(initial.version);
              setPublished(initial.publishedRevision);
              setSaved(JSON.stringify(initial.draft ?? initial.definition));
              setPreview(null);
              setError("");
            }}
          >
            Discard local edits and load latest template
          </button>
        </p>
      )}
      <fieldset disabled={busy || !recovery.ready}>
        {definition.fields.map((f, i) => (
          <section className="br-panel connected-form" key={i}>
            <div className="connected-actions template-field-heading">
              <h3>{f.label || `Custom field ${i + 1}`}</h3>
              <button
                type="button"
                disabled={i === 0}
                aria-label={`Move ${f.label || "field"} up`}
                onClick={() =>
                  setDefinition((d) => {
                    const fields = [...d.fields];
                    [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
                    return { ...d, fields };
                  })
                }
              >
                Move up
              </button>
              <button
                type="button"
                disabled={i === definition.fields.length - 1}
                aria-label={`Move ${f.label || "field"} down`}
                onClick={() =>
                  setDefinition((d) => {
                    const fields = [...d.fields];
                    [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
                    return { ...d, fields };
                  })
                }
              >
                Move down
              </button>
            </div>
            <div className="br-form-grid">
              <label>
                Stable field key
                <input
                  value={f.key}
                  maxLength={48}
                  disabled={initial.definition.fields.some(
                    (p) => p.key === f.key,
                  )}
                  onChange={(e) => field(i, { key: e.target.value })}
                  placeholder="funding_source"
                />
              </label>
              <label>
                Field label
                <input
                  value={f.label}
                  maxLength={120}
                  onChange={(e) => field(i, { label: e.target.value })}
                />
              </label>
              <label className="br-wide">
                Guidance
                <textarea
                  value={f.guidance}
                  maxLength={400}
                  onChange={(e) => field(i, { guidance: e.target.value })}
                />
              </label>
            </div>
            <div className="connected-actions">
              <label>
                <input
                  type="checkbox"
                  checked={f.active}
                  onChange={(e) => field(i, { active: e.target.checked })}
                />{" "}
                Active field
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => field(i, { required: e.target.checked })}
                />{" "}
                Required
              </label>
            </div>
            <div className="template-options">
              {f.options.map((o, j) => (
                <div className="template-option" key={o.id}>
                  <label>
                    Option {j + 1}
                    <input
                      value={o.label}
                      maxLength={120}
                      onChange={(e) =>
                        field(i, {
                          options: f.options.map((p) =>
                            p.id === o.id ? { ...p, label: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={o.active}
                      onChange={(e) =>
                        field(i, {
                          options: f.options.map((p) =>
                            p.id === o.id
                              ? { ...p, active: e.target.checked }
                              : p,
                          ),
                        })
                      }
                    />{" "}
                    Active option
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={f.options.length >= 50}
              onClick={() =>
                field(i, {
                  options: [
                    ...f.options,
                    { id: crypto.randomUUID(), label: "", active: true },
                  ],
                })
              }
            >
              Add dropdown option
            </button>
          </section>
        ))}
        <button
          type="button"
          disabled={definition.fields.length >= 20}
          onClick={() =>
            setDefinition((d) => ({
              ...d,
              fields: [
                ...d.fields,
                {
                  key: "",
                  label: "",
                  guidance: "",
                  required: false,
                  active: true,
                  options: [
                    { id: crypto.randomUUID(), label: "", active: true },
                  ],
                },
              ],
            }))
          }
        >
          Add custom field
        </button>
      </fieldset>
      <div className="connected-actions">
        <button
          disabled={busy || !recovery.ready || !dirty}
          onClick={() => void command("saveDraft")}
        >
          Save template draft
        </button>
        <button
          className="br-primary"
          disabled={busy || !recovery.ready || dirty}
          onClick={() => void command("publish")}
        >
          Publish template
        </button>
        <button
          disabled={busy || !recovery.ready || dirty}
          onClick={() => void command("syncPreview")}
        >
          Sync Template to Existing Projects
        </button>
      </div>
      {dirty && (
        <p role="status" className="field-hint">
          Unsaved draft. Save before publishing or previewing synchronization.
        </p>
      )}
      {busy && <p role="status">Processing template…</p>}
      {error && (
        <p className="br-error" role="alert">
          {error} Your draft remains here. Reload only after copying any changes
          you want to retain.
          <button disabled={busy} onClick={onSaved}>
            Check latest version
          </button>
        </p>
      )}
      {preview && (
        <section
          className="br-panel connected-form"
          aria-label="Template synchronization preview"
        >
          <h3>Review synchronization</h3>
          <p>
            {preview.changedProjects} of {preview.totalProjects} projects will
            advance to published revision {preview.publishedRevision}. Populated
            values are preserved.
          </p>
          <dl className="template-impact">
            <dt>New field/project combinations</dt>
            <dd>{preview.newFields}</dd>
            <dt>Renamed fields across projects</dt>
            <dd>{preview.renamedFields}</dd>
            <dt>Renamed options across projects</dt>
            <dd>{preview.renamedOptions}</dd>
            <dt>Deactivated options across projects</dt>
            <dd>{preview.deactivatedOptions}</dd>
            <dt>Deactivated fields across projects</dt>
            <dd>{preview.deactivatedFields}</dd>
            <dt>Retained inactive values</dt>
            <dd>{preview.incompatibleValues}</dd>
            <dt>Required fields left unset in existing projects</dt>
            <dd>{preview.requiredUnset}</dd>
          </dl>
          {preview.sample.length > 0 && (
            <details>
              <summary>Affected projects (first 50)</summary>
              <ul>
                {preview.sample.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </details>
          )}
          <p>
            Confirmation rechecks every project version. Concurrent edits
            require a fresh preview; repeated confirmation cannot apply the same
            change twice.
          </p>
          <div className="connected-actions">
            <button disabled={busy} onClick={() => setPreview(null)}>
              Cancel synchronization
            </button>
            <button
              className="br-primary"
              disabled={busy || !preview.changedProjects}
              onClick={() => void command("syncCommit")}
            >
              Confirm synchronization
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
export function ProjectTemplateManager({ actorEmail }: { actorEmail: string }) {
  const r = useConnectedData<TemplateView>(endpoint + "?manage=1");
  return (
    <section className="br-panel">
      <header className="br-panel-heading">
        <h2>Project Template</h2>
        <p>
          Configure categorical project metadata, publish a revision, then
          preview synchronization.
        </p>
      </header>
      {r.busy && !r.data && <p role="status">Loading template…</p>}
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.data && (
        <TemplateEditor
          initial={r.data}
          actorEmail={actorEmail}
          onSaved={r.retry}
        />
      )}
    </section>
  );
}
