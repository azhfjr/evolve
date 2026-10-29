# Task identity and independent exact Cost release — 20 October 2026

Production: **https://evolve-rensist.vercel.app**. The owner explicitly approved this candidate and migration 0015. Final verification completed at `2026-10-20T09:24:00.205287+00:00` UTC (20 October 2026, Asia/Makassar).

## Released artifact

- Application source: `c35545f048f08c28fcb168b10d39d7d9b7b7e187`.
- Production deployment: `dpl_FPpMJg7PqrCKC4GbsGhMUz1kAcQ5` (`evolve-r8in9ftc1-jarjirjor777-5316.vercel.app`), target Production, observed READY.
- Reviewed Preview: `dpl_8i9k9YQif6EyrWBKQ2NEaSy442La`.
- Reviewed 232-file digest: `338f1d51c3ed568e2adbe4c2bd8c47924c0a80677c72c376e643340ec70fb667`.
- Production 232-file digest: `9916e98ecfc16a02f33c911c581f4f86a1e5a2a148d1efb2bcd54dff7577077f`.
- The only uploaded override was `vercel.json` buildCommand: `npm run db:migrate && npm run build`. Ordinary repository builds remain unchanged.
- Domain traffic was held on `dpl_CU2iKVFWUAtpS859TsHJLjgotdsk` during migration/build/preflight, then explicitly promoted (HTTP 201). The domain now maps to `dpl_FPpMJg7PqrCKC4GbsGhMUz1kAcQ5`. Automatic domain assignment was restored to its prior `true` value.

## User-visible behavior

Task list and board show complete project names, including long unbroken names, with explicit mobile metadata placement and consistent desktop columns. Empty assignment and unavailable project references are distinct. Task opening, keyboard menus, drag movement and renamed project references remain functional.

Cost accepts large exact values instead of the old practical 9/12-digit cap. Money keeps two decimals and rates six; arithmetic uses exact strings and BigInt. Each option totals only its own items, separately per currency/rate, in project detail, editor and Projects Checklist. There is no combined project Cost across options. Recorded expenses remain independent per-currency records; combined Remaining is removed. Large amounts wrap instead of clipping. The selected Option control has corrected dark-theme contrast.

Technical bounds remain: up to 131,072 whole digits per persisted numeric input, two/six decimals and streamed 2 MB commands. Derived totals allow a carry beyond individual input width. Browser storage/provider resource limits still apply. This release does not promise infinite memory. See [behavior, persistence and acceptance criteria](TASK_COST_PRECISION_REVIEW.md).

## Observed validation

| Check                                                                        | Actual result                                                                                                                                   | Scope                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Exact-source CI](https://github.com/azhfjr/evolve/actions/runs/39398104467) | 151 unit/PostgreSQL and 175 browser tests passed; zero failed/flaky/skipped; types/lint/format/build passed; dependency audit 0 vulnerabilities | Disposable databases and synthetic sessions; reviewed application source                     |
| CI source identity                                                           | Merge tree `28c1091927a9465284ad244a6d02fe4d2df0a7f0` matches application source                                                                | Full suite report inspected                                                                  |
| Reviewed Preview                                                             | 49 browser tests, 60 page/viewport states, 28 navigation/focus states and 8 visual states passed                                                | Isolated browser demo; no Production bindings copied                                         |
| New Production preflight                                                     | 49 browser tests and 8 visual states passed                                                                                                     | Immutable Production artifact before domain promotion                                        |
| Public domain                                                                | 20 targeted browser tests and 8 visual states passed                                                                                            | Full task names/interactions, exact long amounts, independent option totals; demo-only edits |
| Live health and access                                                       | HTTP 200/ready, database connected, schema current, auth configured; eight anonymous private endpoints 401; forged mutation origin 403          | Public custom domain                                                                         |
| Live runtime                                                                 | Login/demo load, private app redirects, demo task edits and inherited labels persist; no tested page errors/overflow                            | No owner session or organization CRUD impersonated                                           |
| Google initiation                                                            | HTTP 200/accounts.google.com, state/PKCE and correct production callback                                                                        | Initiation only; no fresh real-account token exchange                                        |

## Migration and recovery

The secure Vercel runner verified unchanged hashes for migrations 0001–0014 and applied **0015_project_cost_precision.sql**, SHA-256 `2b0ea79f768ac03c05ff7c314c7f395d7d0f6e6a8131ec473c1c41d9168386a9`. All fifteen migration log entries were observed. Migration 0015 widens monetary numeric columns and revalidates the Cost JSON constraint. No data UPDATE/backfill/deletion was performed; isolated PostgreSQL regression preserved stored row values and xmin. Applied SQL is immutable.

Grouped `cost_options` values are authoritative. Future explicit grouped saves use neutral legacy `cost_items=[]` and `budget=0.00` after canonical receipt lookup. Existing grouped projections remain until explicitly saved; legacy single-group input still works. Exact legacy lost-response payload hashes, version/actor guards and labels-only omission remain protected. Readiness requires migration 0015.

Recover with an application supporting large exact values, independent option totals and neutral grouped compatibility fields. The previous deployment is retained as a reference, but an old application can reject/misread newly saved values or display combined totals. Prefer fixing forward. Preserve Calendar deletion recovery/private draft ownership/file tombstones; never automatically undo schema or restore a database.

Physical devices/Safari/Firefox, screen readers, field/load metrics, backup recovery drills and fresh owner Google/Calendar reminder delivery remain outside these synthetic checks. Environment Save/Publish and fresh-task restoration are separate from this completed website release.
