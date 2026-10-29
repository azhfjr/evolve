# Connected workspace verification — historical release

## How to read this record

This is the preserved evidence summary for the 26 October release, not a statement that its source is still deployed. See the [main README](../../../README.md) for the latest recorded application release and current Git integration. Later releases retired meeting-pack creation while preserving historical records and tasks; references below describe the earlier tested workflow.

The numeric results below are historical observations, not tests rerun for this documentation update. Companion JSON files, detailed guides and screenshots remain in the full development checkout; this README-only publication does not include them. Artifact references are shown as paths rather than links to missing GitHub files.

## Original release record

Published 26 October 2026 UTC. [Evolve](https://evolve-rensist.vercel.app) serves application source `d747d8f`, deployment `dpl_FfuBkq32eYMpSxGNnjdR4LkBgQmz`. production-release.json (`production-release.json`) is the authoritative hosted release evidence. Synthetic project/file writes occurred only in an isolated managed database; production checks created no synthetic projects or files.

## Verified results

| Gate                                        | Result                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Domain/integration suite                    | 286 passed, 0 failed after the dependency security patch                                                          |
| Canonical Chromium journeys                 | 14 passed                                                                                                         |
| Canonical Firefox/WebKit journeys           | 28 passed                                                                                                         |
| Existing Firefox/WebKit critical journeys   | 8 passed                                                                                                          |
| Affected existing Chromium regression files | 16 passed                                                                                                         |
| Full Chromium suite                         | 306 passed, 0 failed (18.8 minutes), source `6d77cd9`                                                             |
| TypeScript, lint, formatting                | Passed on final application source `d747d8f`                                                                      |
| Production-mode Next build                  | Passed; hosted ordinary production build `dpl_FfuBkq32eYMpSxGNnjdR4LkBgQmz`                                       |
| Independent review                          | Five implementation findings fixed; three migration-tool findings fixed; no remaining Important/Critical findings |

Canonical journeys exercise task creation from a Board project, draft restoration/conflicts for all three record types, purpose-labelled private uploads, lost reservation response/retry, document versions and private downloads, immutable meeting packs, archive links, authorization/origin boundaries, unified search, cross-user refresh, offline/reconnect, asset assignment races, remembered URL context and live read-only asset details.

## Confirmed defects repaired

| Defect                                                                  | Repair and evidence                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Popup filename collapsed to zero width                                  | Container-responsive document layout; desktop/intermediate-width regression and native screenshots                 |
| Restored project/asset drafts overwrote intervening edits               | Original record version retained; both browser conflict cases preserve local input and remote values               |
| Existing task edits lacked recovery                                     | Account/task-ID draft keys, seven-day text recovery and original version; browser conflict test                    |
| Closing before draft debounce lost text                                 | Close/pagehide flush; delayed-timer browser regression                                                             |
| Archived draft file blocked cleanup and therefore maintenance           | Archived ready files excluded; unrelated pending cleanup proceeds in database regression                           |
| Pending replacement revived a deleted document                          | Migration 0036 clears the current pointer and advances its version on removal; stale finalization rejects          |
| Member could delete a version that became historical before its lock    | Reload and authorize under the deletion lock; controlled interleaving regression                                   |
| Retried replacement reservation allocated another file                  | Owner-scoped request receipts, payload hashes and single allocation; lost-response browser test and migration 0037 |
| Error cleanup could remove a successfully finalized upload              | Pending-only cleanup guard; ready evidence retained and replacement retries recover the recorded result            |
| Changed import request could replay an old receipt                      | Input hash guards for assets/canonical project imports; changed-payload tests                                      |
| Repeat CSV preview falsely reported changes because JSON keys reordered | Stable structural comparison; repeated imports report Unchanged                                                    |
| Stale project editor could unlink a newly assigned asset                | Assignment changes advance affected project versions; stale save rejects                                           |
| Offline views could continue saying Live                                | Explicit stale/offline state, closed stream and reconnect refresh; cross-user browser journey                      |
| Late Board refresh modified a meeting page URL                          | Component/path ownership checks; held-response WebKit regression                                                   |
| URL-backed controls failed to update or lost context during refresh     | Native URL store, initial readiness, whitelisted context preservation; actual query-response and scale map tests   |
| Read-only asset details stayed stale                                    | Reusable authorized live detail view for database/map; cross-user member journey                                   |
| Operations metrics read the wrong database when injected                | Same database passed through; isolated operations integration cases                                                |
| Tiny Board document sizes displayed as 0.0 KB                           | Shared readable file-size formatter                                                                                |

Scope/checklist controls, automatic draft restoration, old CSV identity headers and one-global-status test assumptions were deliberately updated to the approved workflow; these are contract changes, separate from the defects above.

## Scale and indexed-query evidence

scale.json (`scale.json`) records six authenticated endpoints, 3 warm-up requests followed by 20 measured requests each. Measurements include response body consumption; p95 is the nineteenth sorted sample. Environment: 3 CPUs, 10 GB RAM, local PostgreSQL and a production-mode Next server. This is a local regression benchmark, not a production latency guarantee or a sustained concurrent-load test.

The fixture contains 1,000 projects, 10,000 assets and 20,000 tasks. One project has 1,000 assets and 1,000 tasks. Pagination visited every asset page, every project-root page and every task cursor page, finding exactly the complete unique record sets. Its connection map rendered 51 nodes: one root plus one 50-asset page.

query-plans.json (`query-plans.json`) records real EXPLAIN ANALYZE/BUFFERS output for project-scoped asset and task queries, using the asset code and task project/status indexes. Contains-search still performs bounded work across this tested dataset; no production-specific query-plan guarantee is claimed.

## Recovery evidence and limits

The local rehearsal applies all migrations in a clean target, preserves post-cutover Board identities/projections/tasks, restores original legacy project/task IDs, copies actual private local file bytes and verifies readback. Archive counts are reconciled before relational source rows leave active tables. Archived bytes remain read-only and count toward shared quota.

A subsequent managed-provider rehearsal restored all 32 original public tables with matching fingerprints in 73.347 seconds, then applied all migrations and archived the isolated copy. Its original data contained five Locker projects, seven tasks, three Calendar event records and zero attachments. The encrypted original snapshot is retained in the isolated database with its encryption key retained production-only in Vercel. The clone, production migration and archive transition were independently checked. Operations records this one-time evidence; it does not establish an automated daily backup schedule or an ongoing RPO/RTO guarantee.

Real private Blob upload, replacement, historical download, restoration/review reset and deletion were exercised only on synthetic isolated projects. All six test objects were confirmed absent at the provider. Their upload-token safety hold was expired only in the disposable fixture; allocated storage then reconciled to zero. Temporary sessions and deployments were removed. No original production documents existed to restore.

## Dependency gate

dependency-audit.json (`dependency-audit.json`) records zero known vulnerabilities at publication. A scoped `@vercel/cli-config` override upgrades its Zod 4.1.11 dependency to 4.6.7. Regression tests exercise the actual generated auth/global configuration schemas and bounded oversized-array rejection. The domain suite increased from 284 to 286 tests. No previous exception was reused.

## Review scope

The independent reviewer checked `8a746c5..5e8afaf` and returned five actionable findings. They were addressed in one test-backed fix pass. Subsequent author validation also repaired the confirmed integration issues listed above. The reviewer declined production readiness, provider behavior/recovery, real PostgreSQL contention, browser/accessibility and scale judgments; local browser, PostgreSQL and scale evidence above covers only its stated environment.

The subsequent focused release-tool reviews and managed rehearsal closed the backup/cutover/held-build gates. The migration review corrected inconsistent fingerprint separators, incomplete old-writer exclusion and child connection selection by using one atomic same-client transaction with baseline table locks. Static-only one-off deployments prevent instrumentation builds from serving production application routes. See the implementation and recovery guide (`../../CONNECTED_WORKSPACE.md`).

## Hosted verification and production result

The hosted ordinary production candidate used the committed source and unmodified deployment configuration. Its metadata/source digest, healthy schema, original source counts, private APIs, nine application pages and anonymous boundaries passed 14 checks before promotion. The exact deployment was promoted without rebuilding.

The authenticated transition reconciled and archived all five original projects and seven tasks, retaining original IDs, history and existing external Calendar event records. Eighteen live checks then passed: health, activation, original archive IDs, storage, Operations evidence, ten application pages, desktop/phone layout, anonymous boundaries and review-session revocation. There were no browser errors and no synthetic project/file writes in production.

The one-word upload completion copy changed after the full browser run to accurately say “Upload complete” for already-saved project documents. Final static checks and the hosted build passed with that change; the functional upload/revision journeys were also verified against the managed preview.

held-build.json (`held-build.json`), production-boundaries.json (`production-boundaries.json`) and verification.json (`verification.json`) retain the earlier local/pre-release checkpoint for traceability. They are superseded for hosted release status by production-release.json (`production-release.json`).

## Observability limits

Vercel’s runtime-log aggregation tool returned 403. The pinned CLI fallback rejected the available credential format before log access; credentials were not altered. A platform-wide runtime error scan is therefore **not verified**. Live health/access/page checks and browser-console capture succeeded, and the existing admin Operations dashboard remains available. Local scale measurements do not promise production latency, and the one-time recovery rehearsal does not promise a continuing daily-backup schedule.
