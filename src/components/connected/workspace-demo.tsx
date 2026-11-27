"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import "./workspace-demo.css";
const key = "evolve.connected-demo.v1";
const purposes = [
  "Reference",
  "Meeting Notes",
  "KKP",
  "KKO",
  "KKF",
  "Simulation Files",
  "Other",
] as const;
const demoSchema = z.object({
  project: z.number().int().min(0).max(2),
  room: z.enum(["board", "locker"]),
  opened: z.boolean(),
  stages: z.array(z.number().int().min(0).max(10)).length(3),
  tasks: z
    .array(
      z.object({
        id: z.string().max(80),
        project: z.number().int().min(0).max(2),
        title: z.string().max(180),
        done: z.boolean(),
      }),
    )
    .max(100),
  documents: z
    .array(
      z.object({
        project: z.number().int().min(0).max(2),
        name: z.string().max(180),
        purpose: z.enum(purposes),
        revision: z.number().int().min(1).max(10000),
      }),
    )
    .max(100),
  valid: z.array(z.boolean()).length(3),
});
type Demo = z.infer<typeof demoSchema>;
const initial = (): Demo => ({
  project: 0,
  room: "board",
  opened: false,
  stages: [2, 4, 1],
  tasks: [],
  documents: [],
  valid: [false, false, false],
});
const projects = [
  {
    name: "Kalimantan sample generation",
    category: "Pembangkit",
    capacity: "50 MW",
    year: 2028,
    code: "DEMO-GEN-001",
    asset: "Sample generation asset",
    province: "Kalimantan Timur",
  },
  {
    name: "Kalimantan sample transmission",
    category: "Transmisi",
    capacity: "120 kms",
    year: 2029,
    code: "DEMO-TR-002",
    asset: "Sample transmission asset",
    province: "Kalimantan Selatan",
  },
  {
    name: "Kalimantan sample substation",
    category: "Gardu Induk",
    capacity: "100 MVA",
    year: 2030,
    code: "DEMO-GI-003",
    asset: "Sample substation asset",
    province: "Kalimantan Barat",
  },
];
export function WorkspaceDemo() {
  const [state, setState] = useState<Demo>(initial),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [reset, setReset] = useState(false),
    [empty, setEmpty] = useState(false),
    [failure, setFailure] = useState(false),
    [purpose, setPurpose] = useState<(typeof purposes)[number]>("Reference");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = demoSchema.safeParse(JSON.parse(raw));
          if (parsed.success) setState(parsed.data);
          else
            setNotice("Stored demo data was invalid. A fresh sample is shown.");
        }
      } catch {
        setNotice(
          "Browser storage is unavailable. This demo works for this visit only.",
        );
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        setNotice("Demo changes could not be saved in this browser.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state, ready]);
  const project = projects[state.project];
  function createTask() {
    setState((s) => ({
      ...s,
      room: "locker",
      tasks: s.tasks.some(
        (t) =>
          t.project === s.project &&
          t.title === "Review sample project evidence",
      )
        ? s.tasks
        : [
            ...s.tasks,
            {
              id: crypto.randomUUID(),
              project: s.project,
              title: "Review sample project evidence",
              done: false,
            },
          ],
    }));
    setNotice(
      "Follow-up task created against the selected Board Room project.",
    );
  }
  function evidence(name = "Sample-reference.pdf") {
    if (failure) {
      setNotice(
        "Simulated upload failure: existing evidence remains unchanged. Disable the failure example and retry.",
      );
      return;
    }
    setState((s) => ({
      ...s,
      documents: [
        ...s.documents.filter((d) => d.project !== s.project),
        {
          project: s.project,
          name,
          purpose,
          revision:
            (s.documents.find((d) => d.project === s.project)?.revision ?? 0) +
            1,
        },
      ],
      valid: s.valid.map((v, i) => (i === s.project ? false : v)),
    }));
    setNotice(
      "Simulated upload complete. No file bytes were uploaded or retained. Renewed project review is required.",
    );
  }
  const doc = state.documents.find((d) => d.project === state.project);
  return (
    <div className="connected-demo">
      <header>
        <Link href="/">Evolve</Link>
        <span>
          Browser-local demo · synthetic data · no organization access
        </span>
        <Link href="/workspace">Sign in to your workspace</Link>
      </header>
      <main>
        <div className="demo-intro">
          <p className="eyebrow">BOARD ROOM + LOCKER ROOM</p>
          <h1>Explore the connected workspace</h1>
          <p>
            Follow a project from portfolio monitoring to assets, assigned work
            and reviewed evidence. Everything here is a simulation saved only in
            this browser.
          </p>
        </div>
        <nav className="demo-rooms" aria-label="Demo apps">
          <button
            disabled={!ready}
            aria-pressed={state.room === "board"}
            onClick={() => setState((s) => ({ ...s, room: "board" }))}
          >
            Board Room
          </button>
          <button
            disabled={!ready}
            aria-pressed={state.room === "locker"}
            onClick={() => setState((s) => ({ ...s, room: "locker" }))}
          >
            Locker Room
          </button>
        </nav>
        <section className="demo-guide" aria-label="Guided journey">
          <h2>Your guided journey</h2>
          <ol>
            <li>Explore the yearly portfolio.</li>
            <li>Open a project and its assets.</li>
            <li>Create a project-owned follow-up task.</li>
            <li>Simulate evidence upload, then review the project.</li>
          </ol>
        </section>
        <div className="demo-controls">
          <label>
            Selected project
            <select
              disabled={!ready}
              value={state.project}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  project: Number(e.target.value),
                  opened: false,
                }))
              }
            >
              {projects.map((p, i) => (
                <option key={p.code} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!ready}
            onClick={() => setEmpty((v) => !v)}
            aria-pressed={empty}
          >
            Show empty-state example
          </button>
          <button
            disabled={!ready}
            onClick={() => setFailure((v) => !v)}
            aria-pressed={failure}
          >
            Simulate upload failure
          </button>
          <button disabled={!ready} onClick={() => setReset(true)}>
            Reset demo
          </button>
        </div>
        {reset && (
          <section
            className="demo-panel"
            role="group"
            aria-label="Confirm demo reset"
          >
            <p>
              Reset this browser’s demo projects, tasks and simulated evidence?
            </p>
            <button
              onClick={() => {
                setState(initial());
                setReset(false);
                setNotice("Demo reset. Organization data was not affected.");
              }}
            >
              Confirm reset
            </button>
            <button onClick={() => setReset(false)}>Keep exploring</button>
          </section>
        )}
        {notice && (
          <p className="demo-notice" role="status">
            {notice}
          </p>
        )}
        {empty ? (
          <section className="demo-panel">
            <h2>No matching records</h2>
            <p>
              This example shows an empty filter result, not missing
              organization data.
            </p>
            <button onClick={() => setEmpty(false)}>
              Clear example filter
            </button>
          </section>
        ) : state.room === "board" ? (
          <>
            <section className="demo-panel">
              <h2>Portfolio timeline</h2>
              <p>
                Three synthetic projects, ordered by planned COD. Capacity units
                remain independent.
              </p>
              <div className="demo-years">
                {projects.map((p, i) => (
                  <button
                    key={p.code}
                    disabled={!ready}
                    aria-pressed={state.project === i}
                    onClick={() =>
                      setState((s) => ({ ...s, project: i, opened: true }))
                    }
                  >
                    <strong>{p.year}</strong>
                    <span>{p.category}</span>
                    <b>1 project</b>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              <button
                disabled={!ready}
                onClick={() => setState((s) => ({ ...s, opened: true }))}
              >
                Open sample project
              </button>
            </section>
            {state.opened && (
              <section className="demo-panel">
                <h2>{project.name}</h2>
                <p>
                  {project.category} · {project.capacity} · {project.province} ·
                  Planned COD {project.year}
                </p>
                <label>
                  Current workflow stage
                  <select
                    value={state.stages[state.project]}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        stages: s.stages.map((v, i) =>
                          i === s.project ? Number(e.target.value) : v,
                        ),
                      }))
                    }
                  >
                    {Array.from({ length: 11 }, (_, i) => (
                      <option value={i} key={i}>
                        {i === 0 ? "Not started" : `Stage ${i} of 10`}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Workflow position is not physical completion. Stage changes
                  here are simulated.
                </p>
                <h3>Linked asset</h3>
                <p>
                  {project.code} — {project.asset} · {project.capacity}
                </p>
                <button onClick={createTask}>Create follow-up task</button>
                <h3>Project documents — simulated</h3>
                <p>
                  No binaries are sent to a server. Choose a file to demonstrate
                  metadata, or use the sample evidence.
                </p>
                <label>
                  Purpose
                  <select
                    value={purpose}
                    onChange={(e) =>
                      setPurpose(e.target.value as typeof purpose)
                    }
                  >
                    {purposes.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Choose simulated document
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 25 * 1024 * 1024)
                          setNotice("Choose a document no larger than 25 MiB.");
                        else evidence(f.name.slice(0, 180));
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button onClick={() => evidence()}>
                  Simulate evidence upload
                </button>
                {doc ? (
                  <>
                    <p>
                      {doc.name} · {doc.purpose} · Revision {doc.revision}
                    </p>
                    <p>
                      {state.valid[state.project]
                        ? "Valid — simulated admin review"
                        : "Needs review — uploading is not approval"}
                    </p>
                    <button
                      onClick={() => {
                        setState((s) => ({
                          ...s,
                          valid: s.valid.map((v, i) =>
                            i === s.project ? true : v,
                          ),
                        }));
                        setNotice("Project marked valid in this demo only.");
                      }}
                    >
                      Mark project valid — simulation
                    </button>
                    <details>
                      <summary>Simulated revision history</summary>
                      <p>
                        {doc.revision} simulated revisions. Previous binaries do
                        not exist in this demo. Replacing evidence always
                        requires renewed review.
                      </p>
                    </details>
                  </>
                ) : (
                  <p>
                    No files yet. Add sample evidence to explore project-level
                    review.
                  </p>
                )}
              </section>
            )}
          </>
        ) : (
          <section className="demo-panel">
            <h2>Tasks for {project.name}</h2>
            <p>
              Tasks belong to the selected Board Room project, never directly to
              an asset.
            </p>
            {state.tasks.filter((t) => t.project === state.project).length ===
            0 ? (
              <p>No follow-up tasks yet. Create one from the sample project.</p>
            ) : (
              <ul>
                {state.tasks
                  .filter((t) => t.project === state.project)
                  .map((t) => (
                    <li key={t.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() =>
                            setState((s) => ({
                              ...s,
                              tasks: s.tasks.map((x) =>
                                x.id === t.id ? { ...x, done: !x.done } : x,
                              ),
                            }))
                          }
                        />
                        {t.title}
                      </label>
                      <small>
                        {project.name} ·{" "}
                        {t.done ? "Completed" : "Assigned to demo member"}
                      </small>
                    </li>
                  ))}
              </ul>
            )}
            <button
              onClick={() =>
                setState((s) => ({ ...s, room: "board", opened: true }))
              }
            >
              Return to project documents
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
