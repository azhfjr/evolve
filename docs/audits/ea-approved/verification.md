# Approved EA-001–EA-010 implementation

**Production update:** The user subsequently authorized deployment. See [verified release](release/deployment.md). Implementation-phase restrictions and unrun production statements below are historical; the release report records the actual publication and limits.

29 October 2026 (Asia/Singapore). Base `f9932d8`, branch `work`. No deployment, production business writes, schema migration, dependency/provider change, push or merge. EA-011–EA-013 remain outside scope.

## Completed behavior

| ID     | Result                                                                                                                                                                                | Evidence                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| EA-001 | Project/asset/task draft writes and submits stop after logout, including buffered/unmount/pagehide writes and stale editor remounts. Forms become inert with reload/sign-in feedback. | Three editor logout cases and stale-shell remount regression    |
| EA-002 | Selected asset codes survive searching and draft recovery. Authenticated bounded metadata hydration; unavailable selections have identifiable removal/retry states.                   | Search/recovery, deleted-selection, membership/validation tests |
| EA-003 | Search totals remain accurate beyond the last page; preserve outer and original per-result fields in a repeatable-read snapshot.                                                      | Empty-page and compatibility domain regression                  |
| EA-004 | Clipboard success/failure feedback and manual Copy ID fallback, without unhandled rejection.                                                                                          | Denied-clipboard browser regression                             |
| EA-005 | Readable stage/No-files badge colors across themes.                                                                                                                                   | Light/dark contrast checks                                      |
| EA-006 | Asset guide target size and spacing retain native details/summary behavior.                                                                                                           | Axe target-size check                                           |
| EA-007 | Exact level2 scale locator; isolated canonical-scale CI job with PostgreSQL and evidence artifacts. Query plans no longer overwrite historical audit files.                           | Original repository scale suite passes; remote CI NOT RUN       |
| EA-008 | Bounded Hub previews show full counts and project-scoped View all links; filter survives refresh/navigation.                                                                          | Disclosure/link browser test, context regression, scale counts  |
| EA-009 | Independent URL-backed task/notification/review pages with complete totals, stable ordering and existing role/read semantics.                                                         | Domain pagination/role tests and browser reload regression      |
| EA-010 | Nested picker Escape/focus/outside click and accessible labels; native-size checkboxes, touch rows, wrapped labels and full-width search.                                             | Keyboard and six-width/theme/font visual regression             |

## Verification and evidence

Actual result counts are in [results.json](results.json). Raw logs are retained locally in `.vercel/ea-approved-verification/` (ignored, not production telemetry).

- Full domain suite and final affected Chromium checks were rerun after implementation/review fixes.
- Broader Chromium:56/56, existing templates, connected workflows, costs, regional/chart reconciliation and36-route responsive review. This ran before the final review closures; affected suites and full domain checks were rerun afterward.
- Final affected Chromium and Firefox suites:13/13 each, including review closures, checkbox refinement and six-width layout checks. Not full repository Firefox coverage.
- Original canonical scale:1,000 projects,10,000 assets,20,000 tasks,complete pagination,173 graph nodes. Warm local p95 sample38.5–230.4ms across10 endpoints,20 measurements after3 warmups,3 CPU/10GB environment. Not a production SLA or concurrent-load benchmark.
- Layouts:320,390,768,1024,1440,1920px; light/dark, large fonts,reduced motion. Manual screenshot inspection exposed stretched checkbox styling; its size assertion failed before correction.
- Typecheck, lint, formatting, dependency audit and production build checked locally.

## Independent review and failure provenance

One fresh-context reviewer found two important edge cases: editor remount after logout and deleted restored assets remaining Loading. Both were browser-reproduced RED and fixed with passing regression closure. No reviewer minors deferred. No additional concrete auth/API/CI defect was reported; this is not exhaustive security certification.

Other RED evidence covers search totals, action pagination, original nine browser cases, context scope stripping and per-item response compatibility. Initial UI closure revealed Radix document-capture Escape ordering and URL sanitization; both root causes were corrected. A new admin-review fixture initially omitted a required attachment UUID; only the fixture was corrected. Failed logs remain recorded; only successful closure runs count as passing.

## Decisions and limits

- Preserve response fields; new pagination metadata is additive and optional client-side for older responses.
- Keep bounded Hub previews and scoped complete-list links, avoiding unbounded graph/list rendering.
- Logout invalidation lasts for the browser Document, including SPA editor remounts; full reload is required to resume. This trades reload inconvenience for preventing stale actor reuse.
- Missing hydrated IDs are unavailable records, not ongoing loading.
- Keep the existing non-main branch and local work. No remote side effects were authorized.
- WebKit was attempted again: BLOCKED by missing `libGLESv2.so.2`. Remote GitHub Actions NOT RUN; no push.
- No held production build/promotion, live business mutations, real Google OAuth/Calendar/Blob round trips or production recovery exercise. No error-free platform claim; latest audit runtime-log403 remains a limitation.
- Native200% zoom passed the preceding audit but was not rerun for this patch; large-font/viewport checks are separate evidence.
- Rollback is code-only: no schema/data migration. Project IDs, permissions, quota, document review, Board cost ownership and archive boundaries are preserved.

Production requires separate authorization and release verification. No implementation-scope decision remains pending.
