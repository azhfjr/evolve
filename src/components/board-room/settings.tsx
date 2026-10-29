"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { BoardConfig } from "@/lib/board-room/model";
import { boardRequest } from "./api";
export function StageSettings({
  config,
  admin,
  onSaved,
}: {
  config: BoardConfig;
  admin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="br-panel">
      <div className="br-panel-heading">
        <h2>Shared project stages</h2>
        <p>
          Exactly ten stages. Renaming preserves every project’s current
          position.
        </p>
      </div>
      <form
        key={config.version}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await boardRequest({
              action: "stages",
              version: config.version,
              stages: Array.from({ length: 10 }, (_, i) =>
                form.get(`stage-${i}`),
              ),
            });
            await onSaved();
            toast.success("Stage names saved");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="br-form-grid">
          {config.stages.map((s, i) => (
            <label key={i}>
              Stage {i + 1}
              <input
                name={`stage-${i}`}
                required
                maxLength={45}
                defaultValue={s}
                disabled={!admin || busy}
              />
            </label>
          ))}
        </div>
        {error && (
          <p className="br-error" role="alert">
            {error}
          </p>
        )}
        {admin && (
          <footer>
            <button className="br-primary" disabled={busy}>
              Save stage names
            </button>
          </footer>
        )}
      </form>
    </section>
  );
}
