# Board dashboard verification — 27 October 2026

Status: implemented, verified and published to production.

Implemented source: `844f5eb` (based on approved design and plan).

## Confirmed fixes and evidence

- Complete dashboard aggregates remain accurate on empty/out-of-range pages; exact capacity units and zero values preserved.
- Graph project totals no longer become zero on out-of-range pages.
- Malformed serialized chart scopes return validation errors, rather than unhandled JSON errors.
- Phone filters previously collapsed to 48.36px; responsive sizing repaired.
- Overview project popup no longer exposes task previews; dedicated project page retains task management.
- Expanded asset selection retains its project root and details.
- Board is first in chooser and switcher; sign-in still reaches chooser.
- Meeting-pack routes/services removed; historical immutable records and existing tasks retained. Portfolio reporting and Meeting Notes label retained.

Baseline: 286 domain tests passed. Intermediate suite: 294 passed. Seven dashboard browser journeys passed, including 320/768/1024/1440px layout checks. Later pinch helper and malformed-scope regressions passed targeted tests. Typecheck/lint/format checks passed before subsequent focused amendments; final checks pending.

Fresh dependency audit: zero advisories. Full Chromium run was interrupted during session transition; partial run is not counted as a pass. Fresh full run underway. Independent whole-branch review underway.

## Release gates remaining

Resolve review findings with regression tests; complete domain and browser regressions; cross-browser and scale checks; final type/lint/format/build; verify exact held production build and private-access boundaries before promotion. No synthetic live-project files or records.

Runtime-log access was unavailable in previous release; retry through authorized connector and document actual result. Local performance measurements do not imply a production SLO.

## Final local evidence (before held build)

- Full post-review domain suite: 299 passed.
- Full Chromium regression: 303 passed initially; three obsolete UI assertions failed. Connection and portfolio-report replacements passed targeted reruns; empty-dashboard typography assertion also passed after selecting stable chart labels. All 306 journeys accounted for across the full run and targeted reruns.
- Dashboard Chromium: eight passed, including stale-detail failure/recovery regression.
- Critical Firefox/WebKit: eight passed.
- Connected Firefox/WebKit: 28 passed (covers all 14 connected journeys in each browser, including the repaired retirement assertion).
- Dashboard Firefox/WebKit: 16 passed.
- Initial WebKit launch failed because host validation could not find libGLESv2. Isolated extracted Debian browser libraries were supplied using LD_LIBRARY_PATH; actual launch verified. PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS bypassed only the inaccurate host scan, not application tests.
- A runner edited while executing produced shell errors for dashboard/scale commands. Those runs were rejected; complete dashboard cross-browser rerun passed. Scale rerun in a separate immutable runner passed.

Independent review found four Important issues, now fixed: focused child pages reserve rendering budget; live refresh retains map/chart context; selected record components reset identity; task-free hubs skip task counts/previews and task activity. Regression tests observed failing before fixes, then passing (selection browser test also passed in Chromium/Firefox/WebKit).

Deferred minor presentation findings: numeric map stage labels; category bars omit explicit percentage labels. Main stage distribution uses administrator-defined names. Neither changes recorded values or totals.

## Implementation rulings

- Continue in the existing clean task-owned non-main checkout, preserving environment continuity; mistaken isolation could affect unrelated work, mitigated by scoped commits.
- Packaged bookkeeping script unavailable; equivalent plan ledger maintained manually; cost is bookkeeping drift.
- Shared project predicates moved into a separate module to avoid cycles. Valid evidence requires current ready files; stale historical review flags cannot create overlapping readiness counts.
- Conflicting location filters rejected by the read predicate to retain saved-view schema composition; malformed saved views may be stored but read returns a clear 400.
- Dashboard/map tasks committed as an integrated working slice; cost is a larger review diff.
- Serialized JSON scope used consistently for graph and Assets drill-down instead of dotted URL fields; no existing external dotted-field clients were identified.

## Production result

- Live URL: https://evolve-rensist.vercel.app/workspace
- Exact ordinary production build: `dpl_2Fd3rdfaXKHLrBxe37refYhKyoSS`.
- Deployed source: `6db519e07fdac31cce137adb81d0bef6d118409f`; source digest `5984eb899e8ba896ce629f08b4f4ae863aeb2a295782da8d494aa7062c9b9bcc`.
- Build READY, verified against source identity before promotion; same deployment promoted without rebuild.
- Held checks: eight passed, zero page errors. Production checks: eight passed. Private APIs reject anonymous access, retired meeting routes return 404, health ready.
- Temporary platform review access revoked; normal automatic domain assignment restored.
- Rollback deployment: `dpl_FfuBkq32eYMpSxGNnjdR4LkBgQmz`. No schema/storage migration, archival transition or synthetic live project/file mutation occurred; deployment rollback preserves user writes.
- Scale fixture: 1,000 projects, 10,000 assets, 20,000 tasks; complete pagination checked. Dashboard/search p95 71.95/118.38ms; graph rendering 173 nodes within 250 maximum. Environment: 3 CPUs, 10GB RAM, 20 measured requests per route after warm-up. These are disposable-environment measurements, not production latency guarantees.
- Final typecheck/lint/format passed; dependency audit zero advisories.

## Verification limits

Signed-in production workflows were not replayed against user projects; those journeys passed in disposable Chromium/Firefox/WebKit fixtures. Production used health and access boundaries only. Reflow was checked across phone/tablet/desktop widths and font settings; a separate native-browser 200% zoom session was not recorded. The runtime-log connector again returned 403; CLI is unavailable in this environment, so no platform-wide clean-error-log claim is made. Browser page-error checks cover the held public access journey only.

Vercel connector deployment creation returned403; the previously authorized existing deployment credential successfully created the held build through the same scoped API. Promotion succeeded through the connector when the redundant team selector was omitted; explicit project/deployment identity remained fixed.
