# Evolve B/C refinement — EV-06–EV-16

Approved scope: shared UI, navigation strips, Data Quality/attention/review workflows, connected demo, charts, personal context and isolated scale verification. Base: `39dc18b`. Original A-group exclusions remain, except the owner subsequently approved EV-01’s exact heading locator and EV-02’s Queue-scoped dependency patch. Production publication is authorized after verified demo and release gates. No storage-provider migration is included.

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

| Check                             | Observed result                                                                                                       | Status / limitation                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New B/C browser acceptance        | 11/11 Chromium; Firefox 10/10 checkpoint, final contrast regression rerun pending                                     | PASS; six widths (320/390/768/1024/1440/1920), themes, large fonts, reduced motion, scope preservation, member read-only workbench, complete stage-zero summary, archive appearance |
| Full existing Chromium regression | 294/295 passed; sole failure was unchanged ambiguous connection-map heading                                           | EV-01 repaired the locator with exact text and heading level; affected journey then 1/1 PASS. The complete suite was not repeated after this locator-only repair.                   |
| Native browser zoom               | Board and Locker at actual 200% via chrome.tabs.setZoom; viewport/scroll width 720/720                                | PASS; recorded screenshots and JSON                                                                                                                                                 |
| WebKit                            | Browser failed before application launch: missing libGLESv2.so.2                                                      | BLOCKED; no WebKit application pass claimed                                                                                                                                         |
| Queue dependency regression       | Reproduced vulnerable scoped version 10.2.6, then 11.0.8 passes route glob and SDK callback/send compatibility checks | PASS; @vercel/queue stays 0.8.0; no global minimatch override                                                                                                                       |
| Production dependency audit       | npm audit --omit=dev: zero advisories                                                                                 | PASS; full audit still reports seven moderate development-only ESLint-chain entries from GHSA-g3hv-75wg-m249; broader toolchain changes remain excluded                             |
| Hosted synthetic demo             | Project → Locker follow-up journey; no runtime errors; /api/workspace returns 404                                     | PASS; client-only preview, Vercel owner sign-in, no production bindings                                                                                                             |

Final domain/integration: 352/352 PASS. Critical Firefox vertical slices: 3/3 PASS (canonical task creation, safe document replacement/private revision download, realtime reconnect preserving unfinished input). Final isolated scale rerun: 2/2 PASS; complete pagination, 147 graph nodes, 2,240 files / 58,240 bytes, twelve endpoint p95s 74.0–599.3ms. Sampled heap 19,177,308 bytes; environment 3 CPUs/10GB memory. Raw evidence retained privately. Held-build observations are appended after release verification. Typecheck, lint and full formatting checks passed on the release candidate. Browser suites build and run production-mode Next.js.

Scale checkpoint: 2/2 passed; complete 2,000/10,000/20,000 record traversal, 147 rendered graph nodes, 58,240 allocated bytes across 2,240 file versions. Twelve endpoint p95 samples 14.0–398.7ms (3 warmups,20 measurements). Sampled Chromium JS heap 19.8MB, not peak memory or a production SLA. Final rerun preserves raw JSON in ignored `.vercel/bc-evidence/`.

## Independent review and rulings

One independent final review found no critical finding or authorization bypass. The single correction pass fixed: removing a reason losing portfolio scope; two remaining legacy demo fixtures; missing Not started in the complete stage table; and incomplete large-font demo coverage. Each had reproduced failing evidence, followed by targeted passing checks. Archive appearance was also reproduced and corrected through the existing saved-experience boundary. Final accessibility QA found a serious dark-theme contrast defect in new demo selected controls: the first held candidate was rejected without promotion. A new browser regression reproduced it, then passed after replacing selected accent text with the existing readable foreground token; accent borders remain.

Deferred minor: two tabs of the browser-local synthetic demo can overwrite one another’s demo state. It does not affect authenticated drafts or production records. No second implementation-review agent was used.

## Safety and decisions

Project validity remains project-level. There is no new approval schema. Current document review fields may be cleared by evidence changes; the interface does not invent a previously reviewed file manifest. Recent history is explicitly bounded and is not a complete audit export.

The public connected demo never calls private mutation endpoints. It stores validated synthetic text/metadata only; selected file bodies are never read or uploaded. Authentication, real uploads and provider behavior still require their own verification.

The original 1,000-project canonical fixture is unchanged by default. The new runner opts into2,000 projects against the same guarded localhost disposable database, then generates local synthetic files. Scale tests must run sequentially with other browser suites sharing `.next`.

EV-01/EV-02 are now explicitly approved and their focused regressions pass. Production is held until remaining release checks and exact held-build verification complete. Provider-level capacity/concurrency, real Google consent, real-device behavior and production recovery are not established by local fixtures. No synthetic business records/files are created in production.
