"use client";
import { AppSelect } from "./app-select";
import {
  workspaceConfigurationSchema,
  type WorkspaceConfiguration,
} from "@/lib/preferences";
export function WorkspaceControls({
  configuration,
  onChange,
}: {
  configuration: Partial<WorkspaceConfiguration>;
  onChange: (value: WorkspaceConfiguration) => void;
}) {
  // Keep invalid draft values editable; validation runs when the form is saved.
  const config = {
    ...workspaceConfigurationSchema.parse({}),
    ...configuration,
  };
  const change = (patch: Partial<WorkspaceConfiguration>) =>
    onChange({ ...config, ...patch });
  return (
    <div className="workspace-controls">
      <section>
        <h3>Planning defaults</h3>
        <p className="field-help">
          Defaults apply to new items. Existing work keeps its saved values.
        </p>
        <div className="form-grid">
          <label>
            Project currency
            <AppSelect
              aria-label={"Project currency"}
              value={config.defaultCurrency}
              onValueChange={(nextValue) =>
                change({ defaultCurrency: nextValue as "IDR" | "USD" })
              }
            >
              <option>IDR</option>
              <option>USD</option>
            </AppSelect>
          </label>
          <label>
            Task priority
            <AppSelect
              aria-label={"Task priority"}
              value={config.defaultPriority}
              onValueChange={(nextValue) =>
                change({
                  defaultPriority:
                    nextValue as WorkspaceConfiguration["defaultPriority"],
                })
              }
            >
              {["none", "low", "medium", "high", "urgent"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </AppSelect>
          </label>
        </div>
        <fieldset className="working-days">
          <legend>Working days</legend>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
            (day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={config.workingDays.includes(index)}
                  onChange={(e) =>
                    change({
                      workingDays: e.target.checked
                        ? [...config.workingDays, index].sort()
                        : config.workingDays.filter((d) => d !== index),
                    })
                  }
                />
                {day}
              </label>
            ),
          )}
        </fieldset>
      </section>
      <section>
        <h3>Access & operations</h3>
        <label>
          Allowed invitation domains
          <input
            placeholder="example.com, partner.com"
            value={config.allowedInviteDomains.join(",")}
            onChange={(e) =>
              change({
                allowedInviteDomains: e.target.value
                  .split(",")
                  .map((s) => s.trim().toLowerCase()),
              })
            }
          />
          <small>
            Separate domains with commas. Leave empty to invite any Google
            email. Every address still needs an invitation.
          </small>
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={config.readOnly}
            onChange={(e) => change({ readOnly: e.target.checked })}
          />
          Pause member task editing (administrator can still edit)
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={config.calendarEnabled}
            onChange={(e) => change({ calendarEnabled: e.target.checked })}
          />
          Enable Google Calendar integration
        </label>
        <div className="form-grid">
          <label>
            Activity window
            <AppSelect
              aria-label={"Activity window"}
              value={config.activityWindowDays}
              onValueChange={(nextValue) =>
                change({
                  activityWindowDays:
                    nextValue as WorkspaceConfiguration["activityWindowDays"],
                })
              }
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
              <option value="all">All history</option>
            </AppSelect>
            <small>
              Controls the activity feed; stored history is preserved.
            </small>
          </label>
          <label>
            Activity page size
            <AppSelect
              aria-label={"Activity page size"}
              value={config.activityPageSize}
              onValueChange={(nextValue) =>
                change({
                  activityPageSize:
                    nextValue as WorkspaceConfiguration["activityPageSize"],
                })
              }
            >
              {["25", "50", "100"].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </AppSelect>
          </label>
        </div>
      </section>
    </div>
  );
}
