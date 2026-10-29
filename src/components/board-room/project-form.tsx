"use client";
import { useConnectedData } from "../connected/data";
import { ProjectTemplateFields } from "../project-template-fields";
import type { TemplateView } from "@/lib/project-template/service";
import type { CustomValues } from "@/lib/project-template/model";
import { PLANNED_COD_YEARS } from "@/lib/board-room/cod-policy";
import { FieldHint } from "../field-hint";
import { FormDraftRecovery } from "../connected/draft-recovery";
import { AssetPicker } from "../connected/asset-picker";
import { AppSelect } from "../app-select";
import { useState, useEffect, useRef } from "react";
import { ZodError } from "zod";
import { toast } from "sonner";
import {
  projectSchema,
  parseLinkText,
  PRIMARY_CATEGORIES,
  CAPACITY_UNITS,
  KALIMANTAN_PROVINCES,
  type BoardProject,
} from "@/lib/board-room/model";
import { boardRequest } from "./api";
import {
  CreationDocuments,
  type CreationDocumentsHandle,
} from "./creation-documents";
import { BoardModal } from "./modal";
export function ProjectForm({
  actorEmail,
  project,
  onClose,
  onSaved,
}: {
  actorEmail: string;
  project: BoardProject | null;
  onClose: () => void;
  onSaved: (p: BoardProject) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null),
    clearDraft = useRef<() => void>(() => {});
  const template = useConnectedData<TemplateView>(
    "/api/board-room/project-template" + (project ? "?id=" + project.id : ""),
    true,
  );
  const initialTemplateRevision = useRef<number | undefined>(
    project?.templateRevision,
  );
  useEffect(() => {
    if (template.data && initialTemplateRevision.current === undefined)
      initialTemplateRevision.current = template.data.revision;
  }, [template.data]);
  const [customValues, setCustomValues] = useState<CustomValues>(
    project?.customValues ?? {},
  );
  const [templateRevision, setTemplateRevision] = useState<number | undefined>(
    project?.templateRevision,
  );
  const [creationRequestId] = useState(() => crypto.randomUUID());
  const [assetIds, setAssetIds] = useState<string[] | undefined>(undefined);
  const documents = useRef<CreationDocumentsHandle>(null);
  const created = useRef<BoardProject | null>(null);
  const [savedProject, setSavedProject] = useState<BoardProject | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState(false);
  useEffect(() => {
    if (!dirty && !pendingDocuments && !busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });
  const [draftVersion, setDraftVersion] = useState(project?.version);
  const [category, setCategory] = useState(project?.category ?? "");
  const [codYear, setCodYear] = useState(String(project?.codYear ?? ""));
  const [location, setLocation] = useState(project?.location ?? "");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false),
    [discarding, setDiscarding] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discarding) keepEditing.current?.focus();
  }, [discarding]);
  const requestClose = () => {
    if (busy) return;
    if (dirty || pendingDocuments || savedProject) setDiscarding(true);
    else onClose();
  };
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setError("");
    try {
      if (project && !draftVersion)
        throw new Error(
          "This older draft has no record version. Copy your changes and reload before saving.",
        );
      if (!template.data)
        throw new Error(
          "Load the project template before saving. Retry if unavailable.",
        );
      const documentError = documents.current?.validate();
      if (documentError) throw new Error(documentError);
      if (created.current) {
        setBusy(true);
        if (await documents.current?.upload(created.current.id))
          onSaved(created.current);
        else
          setError(
            "Project created; some documents still need uploading. Resume uploads or continue to the project.",
          );
        return;
      }
      const number = (key: string) =>
        String(form.get(key)).trim() === "" ? null : Number(form.get(key));
      const values = projectSchema.parse({
        externalId: project?.externalId ?? String(form.get("externalId")),
        name: form.get("name"),
        templateRevision: templateRevision ?? initialTemplateRevision.current,
        customValues,
        category,
        location,
        description: form.get("description"),
        capacity: number("capacity"),
        unit: form.get("unit"),
        startYear: number("startYear"),
        codYear: codYear === "" ? null : Number(codYear),
        ...parseLinkText(String(form.get("links"))),
        responsible: form.get("responsible"),
        documentChecklist: project?.documentChecklist ?? [],
        scope: project?.scope ?? "",
        voltage: form.get("voltage"),
      });
      setBusy(true);
      const result = await boardRequest<{ project: BoardProject }>({
        action: "saveProject",
        requestId: project ? undefined : String(form.get("creationRequestId")),
        id: project?.id,
        version: draftVersion,
        values,
        assetIds,
      });
      if (!project) {
        created.current = result.project;
        setSavedProject(result.project);
        if (!(await documents.current?.upload(result.project.id))) {
          setError(
            "Project created; some documents still need uploading. Resume uploads or continue to the project.",
          );
          return;
        }
      }
      clearDraft.current();
      toast.success(project ? "Project saved" : "Project created");
      onSaved(result.project);
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          : e instanceof Error
            ? e.message
            : "Could not save project.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <BoardModal
      title={
        discarding
          ? savedProject
            ? "Leave unfinished uploads?"
            : "Discard unsaved project changes?"
          : project
            ? "Edit project"
            : "Add project"
      }
      onClose={discarding ? () => setDiscarding(false) : requestClose}
    >
      {discarding && (
        <div className="br-dialog-body">
          <p>
            {savedProject
              ? "The project and completed uploads are saved. Remaining selected files will be lost if you leave."
              : "Your project edits and selected files have not been saved."}
          </p>
          <div className="br-document-actions">
            <button ref={keepEditing} onClick={() => setDiscarding(false)}>
              {savedProject ? "Keep uploading" : "Keep editing"}
            </button>
            <button
              className="br-primary"
              onClick={() => {
                clearDraft.current();
                if (savedProject) onSaved(savedProject);
                else onClose();
              }}
            >
              {savedProject ? "Continue to project" : "Discard changes"}
            </button>
          </div>
        </div>
      )}
      <form
        ref={formRef}
        onSubmit={save}
        hidden={discarding}
        onChangeCapture={() => setDirty(true)}
      >
        <input
          type="hidden"
          name="creationRequestId"
          defaultValue={creationRequestId}
        />
        <FormDraftRecovery
          email={actorEmail}
          kind="project"
          version={draftVersion}
          id={project?.id ?? "new"}
          formRef={formRef}
          extra={{
            category,
            location,
            codYear,
            assetIds: assetIds ?? [],
            customValues,
            templateRevision: templateRevision ?? template.data?.revision,
          }}
          onReady={(clear) => {
            clearDraft.current = clear;
          }}
          onRestore={(v) => {
            if (project)
              setDraftVersion(
                typeof v.__baseVersion === "number" ? v.__baseVersion : 0,
              );
            if (typeof v.category === "string")
              setCategory(v.category as typeof category);
            if (typeof v.codYear === "string" || typeof v.codYear === "number")
              setCodYear(String(v.codYear));
            if (typeof v.location === "string") setLocation(v.location);
            if (Array.isArray(v.assetIds)) setAssetIds(v.assetIds as string[]);
            if (
              v.customValues &&
              typeof v.customValues === "object" &&
              !Array.isArray(v.customValues)
            )
              setCustomValues(v.customValues as CustomValues);
            if (typeof v.templateRevision === "number")
              setTemplateRevision(v.templateRevision);
            setDirty(true);
          }}
        />
        <fieldset
          disabled={busy || !!savedProject}
          className="br-form-grid br-form-fields"
        >
          <input
            type="hidden"
            name="externalId"
            defaultValue={project?.externalId ?? `PRJ-${crypto.randomUUID()}`}
          />
          {template.error && (
            <p className="br-wide br-error" role="alert">
              {template.error}
              <button type="button" onClick={template.retry}>
                Retry template
              </button>
            </p>
          )}
          {!template.data && !template.error && (
            <p role="status">Loading project template…</p>
          )}
          {template.data && (
            <ProjectTemplateFields
              definition={template.data.definition}
              values={customValues}
              existing={!!project}
              onChange={(values) => {
                setCustomValues(values);
                setDirty(true);
              }}
            />
          )}
          <AssetPicker
            projectId={project?.id}
            value={assetIds}
            onChange={setAssetIds}
          />
          <label>
            Project name
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={project?.name ?? ""}
            />
          </label>
          <label>
            Primary category
            <AppSelect
              aria-label="Primary category"
              name="category"
              value={category}
              onValueChange={(value) => {
                setCategory(value as typeof category);
                setDirty(true);
              }}
            >
              <option value="">Not set</option>
              {PRIMARY_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </AppSelect>
          </label>
          <label>
            Location
            <AppSelect
              name="location"
              value={location}
              onValueChange={(value) => {
                setLocation(value);
                setDirty(true);
              }}
              aria-label="Location"
            >
              <option value="">Not set</option>
              {project?.location &&
                !KALIMANTAN_PROVINCES.some((p) => p === project.location) && (
                  <option value={project.location}>
                    {project.location} (existing location)
                  </option>
                )}
              {KALIMANTAN_PROVINCES.map((province) => (
                <option key={province}>{province}</option>
              ))}
            </AppSelect>
          </label>
          <label>
            Voltage
            <input
              name="voltage"
              maxLength={120}
              defaultValue={project?.voltage ?? ""}
              placeholder="150 kV or 275/150 kV"
            />
          </label>
          <label>
            Capacity
            <input
              name="capacity"
              type="number"
              step="any"
              min={0}
              defaultValue={project?.capacity ?? ""}
            />
          </label>
          <label>
            Capacity unit
            <input
              name="unit"
              list="br-units"
              maxLength={30}
              defaultValue={project?.unit ?? ""}
              placeholder="Choose or enter a custom unit"
            />
            <datalist id="br-units">
              {CAPACITY_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label>
            Start year
            <input
              name="startYear"
              type="number"
              min={1900}
              max={2200}
              step={1}
              defaultValue={project?.startYear ?? ""}
              placeholder="YYYY"
            />
          </label>
          <label>
            Planned COD year
            <AppSelect
              name="codYear"
              aria-label="Planned COD year"
              aria-describedby="project-cod-hint"
              value={codYear}
              onValueChange={setCodYear}
            >
              <option value="">Select Planned COD Year</option>
              {project?.codYear != null &&
                !PLANNED_COD_YEARS.includes(project.codYear) && (
                  <option value={String(project.codYear)}>
                    {project.codYear} (stored historical year)
                  </option>
                )}
              {PLANNED_COD_YEARS.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </AppSelect>
            <FieldHint id="project-cod-hint">
              Optional. Choose 2026–2040; an existing historical year may be
              retained.
            </FieldHint>
          </label>
          <label className="br-wide">
            Responsible contact
            <input
              name="responsible"
              maxLength={160}
              defaultValue={project?.responsible ?? ""}
              placeholder="Person or team responsible for the next project update"
            />
          </label>
          <label className="br-wide">
            Description
            <textarea
              name="description"
              maxLength={2000}
              defaultValue={project?.description ?? ""}
            />
          </label>
          <label className="br-wide">
            Project links{" "}
            <small>One URL per line, optionally: Label | https://…</small>
            <textarea
              name="links"
              defaultValue={
                project?.links
                  .map((url, i) =>
                    project.linkLabels?.[i]
                      ? `${project.linkLabels[i]} | ${url}`
                      : url,
                  )
                  .join("\n") ?? ""
              }
            />
          </label>
        </fieldset>
        {!project && (
          <CreationDocuments
            ref={documents}
            busy={busy}
            onPending={setPendingDocuments}
            onDirty={() => setDirty(true)}
          />
        )}
        {savedProject && (
          <p className="br-note" role="status">
            Project created. Completed uploads are saved; unfinished files stay
            in this form until you leave.
          </p>
        )}
        {error && (
          <p className="br-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={requestClose}>
            {savedProject ? "Continue to project" : "Cancel"}
          </button>
          <button className="br-primary" disabled={busy || !template.data}>
            {busy
              ? "Saving…"
              : savedProject
                ? "Resume uploads"
                : project
                  ? "Save project"
                  : "Create project"}
          </button>
        </footer>
      </form>
    </BoardModal>
  );
}
