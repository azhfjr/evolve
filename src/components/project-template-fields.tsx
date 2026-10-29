"use client";
import { useId } from "react";
import { useConnectedData } from "./connected/data";
import type { TemplateView } from "@/lib/project-template/service";
import { AppSelect } from "./app-select";
import { FieldHint } from "./field-hint";
import type {
  TemplateDefinition,
  CustomValues,
} from "@/lib/project-template/model";
export function ProjectTemplateFields({
  definition,
  values,
  onChange,
  existing = false,
}: {
  definition: TemplateDefinition;
  values: CustomValues;
  onChange?: (values: CustomValues) => void;
  existing?: boolean;
}) {
  const prefix = useId();
  if (!definition.fields.length) return null;
  return (
    <section className="br-wide template-project-fields">
      <h3>Project metadata</h3>
      {onChange && existing && (
        <p className="field-hint">
          New required fields may stay unset until custom metadata is changed.
          Changing custom metadata requires all active required fields.
        </p>
      )}
      <div className="br-form-grid">
        {definition.fields
          .filter((f) => f.active || values[f.key])
          .map((f) => {
            const value = values[f.key] ?? "",
              option = f.options.find((o) => o.id === value);
            return (
              <div className="template-project-field" key={f.key}>
                <label htmlFor={prefix + "custom-" + f.key}>
                  {f.label}
                  {f.required && f.active ? " *" : ""}
                </label>
                {onChange && f.active ? (
                  <AppSelect
                    id={prefix + "custom-" + f.key}
                    aria-label={f.label}
                    aria-describedby={
                      f.guidance ? prefix + "custom-hint-" + f.key : undefined
                    }
                    value={value}
                    onValueChange={(value) =>
                      onChange({ ...values, [f.key]: value || null })
                    }
                  >
                    <option value="">Not set</option>
                    {f.options
                      .filter((o) => o.active || o.id === value)
                      .map((o) => (
                        <option key={o.id} value={o.id} disabled={!o.active}>
                          {o.label}
                          {!o.active ? " (inactive; retained)" : ""}
                        </option>
                      ))}
                  </AppSelect>
                ) : (
                  <p id={prefix + "custom-" + f.key}>
                    {option?.label ??
                      (value ? "Historical option " + value : "Not set")}
                    {!f.active ? " (inactive field)" : ""}
                  </p>
                )}
                {f.guidance && (
                  <FieldHint id={prefix + "custom-hint-" + f.key}>
                    {f.guidance}
                  </FieldHint>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}

export function ProjectTemplateDetails({ id }: { id: string }) {
  const r = useConnectedData<TemplateView>(
    "/api/board-room/project-template?id=" + id,
  );
  return (
    <>
      {r.busy && !r.data && <p role="status">Loading project metadata…</p>}
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.data && (
        <>
          <ProjectTemplateFields
            definition={r.data.definition}
            values={r.data.values}
          />
          {r.data.pendingUpdate && (
            <p className="field-hint">
              This project retains template revision {r.data.revision}. An
              administrator can preview and synchronize the published template
              without clearing values.
            </p>
          )}
        </>
      )}
    </>
  );
}
