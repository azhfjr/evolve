# Evolve B/C refinement — EV-06–EV-16

Approved scope: shared UI, navigation strips, Data Quality/attention/review workflows, connected demo, charts, personal context and isolated scale verification. Base: `39dc18b`. No A-group repair, storage-provider migration or production publication is included.

## Changes

| IDs         | Implemented behavior                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EV-06/09/10 | Shared portal page hierarchy, smaller title roles, dedicated search toolbar, Files without unrelated Project Fields action, scalable page-title token.                                                                                                     |
| EV-07       | Stage/year previous/next controls, resize/selection-aware scroll boundaries and complete selectable count tables.                                                                                                                                          |
| EV-08       | Guided root demo with Board projects/assets, project-owned Locker follow-up tasks and clearly simulated metadata-only document review; validated local persistence, reset/empty/failure examples. Explicit historical demo URLs remain supported.          |
| EV-11       | URL-backed workbench sections; grouped project attention, evidence review and regional findings; active member reads and unchanged admin mutation controls. Counts are independent of pagination in repeatable-read transactions.                          |
| EV-12       | Current/last reviewed evidence revisions, reviewer/timing, current files uploaded since review, recent evidence events and explicit missing/incomplete historical-baseline disclosure. Existing revision/conflict/review-reset rules remain authoritative. |
| EV-13       | Missing/unrecognized regional records link to the existing version-checked editor. No automatic city inference or silent province reassignment.                                                                                                            |
| EV-14       | Current-filter explanation, clear-filter action and explicit chart selection states; existing colors, tables, units and zero-data behavior preserved.                                                                                                      |
| EV-15       | Personal action explanations, direct evidence-review links, accurate canonical project identity in cross-room links; legacy code-based matching retained when connected mode is off.                                                                       |
| EV-16       | Separate opt-in 2,000-project fixture with 10,000 assets,20,000 tasks,2,000 documents and2,240 file versions. Includes200 retained,20 pending,20 deleting versions and real local synthetic bytes.                                                         |

## Verification ledger

- New browser acceptance tests reproduced all four initial missing behaviors before implementation. Fresh-build closure:6/6 passed, including six widths, both themes, large-font/reduced-motion states and member read-only behavior.
- Domain/integration suite:351/351 passed on the implementation checkpoint.
- Asset/attention suite:11/11; cross-room links:3/3, including deliberate read-permission contract update and RED→GREEN identity-mode regression.
- Typecheck, lint and full formatting checks passed at the implementation checkpoint. Browser suites built and started production-mode Next.js.
- Scale:2/2 passed; complete2,000/10,000/20,000 record traversal,147 rendered graph nodes,58,240 allocated bytes across2,240 file versions. Twelve endpoint p95 samples14.0–398.7ms (3 warmups,20 measurements). Sampled Chromium JS heap19.8MB, not peak memory or a production SLA.
- Full Chromium and critical cross-browser results remain pending final regression/review.
- Test traces, screenshot files and raw logs are under ignored `test-results` and `/tmp/bc-*`; fixture sessions remain private in ignored `.data`.

## Safety and decisions

Project validity remains project-level. There is no new approval schema. Current document review fields may be cleared by evidence changes; the interface does not invent a previously reviewed file manifest. Recent history is explicitly bounded and is not a complete audit export.

The public connected demo never calls private mutation endpoints. It stores validated synthetic text/metadata only; selected file bodies are never read or uploaded. Authentication, real uploads and provider behavior still require their own verification.

The original 1,000-project canonical fixture is unchanged by default. The new runner opts into2,000 projects against the same guarded localhost disposable database, then generates local synthetic files. Scale tests must run sequentially with other browser suites sharing `.next`.

Production remains held for demo review and unresolved EV-01/EV-02 release findings. Provider-level capacity/concurrency, real Google consent, real-device behavior and production recovery are not established by local fixtures. No synthetic business records/files are created in production.
