# Feature expansion verification

Status: **PRODUCTION VERIFIED** at https://evolve-rensist.vercel.app. Exact held build promoted and checked after temporary-access cleanup.

## Changes

Board Room has dedicated Storyline, shared regional Map, project financial editing, and administrator-managed versioned project templates. Shared metadata fields render in creation, editing and project details. Imports/exports and custom filters preserve stable option identities. Locker financial input is retired; historical financial records remain readable under their original project identities.

Confirmed defects repaired: financial writes did not advance Board Activity refresh; browser drafts dropped custom selections and could advance their template revision; unknown historical categories crashed dashboard summaries; restored custom filters could become invisible and lacked Clear filters. Synchronization previews now count renamed/deactivated options. Migration0041 prevents older application clients from discarding pinned metadata.

## Acceptance and evidence

- Domain/integration: 340 passing after final review fixes.
- Feature journeys: seven passing, including the reviewer regression RED→GREEN and pinned template draft recovery.
- Financial journeys: eight passing, including all four units, exact large values, cancel, conflict, and five viewport widths with accessibility checks.
- Connected workflows: 14 passing, including documents, tasks, archive, permissions, concurrent assignment, remote updates and draft preservation.
- Storyline/COD/Asset/ZIP: seven passing, including native browser200% zoom in both applications.
- Regional/chart/responsive journeys: nine passing.
- Chromium inventory: all295 current cases have passing evidence in `chromium-coverage.json`. After the final cached-filter URL fix, all16 targeted Board/navigation/saved-view regressions passed. Older tests that expected retired Locker financial controls were ported to read-only historical fixtures and Board financial journeys. Interrupted and obsolete failures remain in raw logs; they are not reported as passing.
- Cross-browser:16 financial journeys and10 Storyline/map/permission/draft/filter journeys passed in Firefox/WebKit. Three baseline route-audit runs also passed across Chromium/Firefox/WebKit, both themes and font scales.
- Scale: disposable1,000 projects /10,000 assets /20,000 tasks. Complete pagination and173 bounded rendered nodes. Ten measured request groups had p95 61.2–305.6ms,20 measurements each after warmup. This is local-environment evidence, not a production latency guarantee.
- Type checking, lint, formatting and dependency checks passed; dependency audit reported zero advisories. Final type checking, lint and formatting passed; the held production build reached READY.

## Recovery and release

A fresh encrypted production snapshot restored47 tables with exact hashes. Both pending migrations0040/0041 rehearsed successfully; existing rows and file references were preserved. Both migrations were applied in one guarded production transaction; project/document integrity checks passed and no file contents changed.

Held deployment: `dpl_8M7G4rkAZuBRpaYxBnbCdbXRd6bm`; source `295c10191726008dc7691a293e09a840c7508c56`, digest `43eeda6a5887b922fec945d51af817e806320f26da7eb6b31e61d4ce3cd547af`. This exact READY build was verified and promoted. Previous production/rollback target: `dpl_HEug9h7EGT5XBUd5R3H5xrCBzWSo`.

Held and public production each passed21 health/route/private-access/geometry smoke checks, with no browser exceptions observed. Three additional health/private-access checks passed after cleanup. Temporary review access was revoked, credential copies removed, and automatic domain assignment restored. No synthetic production records or files were created. Signed-in production mutation journeys are deliberately excluded. Both runtime logs and grouped runtime-error APIs returned403; the Vercel CLI is unavailable. This limits platform-wide error inspection and does not establish an absence of runtime errors.

## Decisions and limits

1. Keep original canonical financial rows with an independent financial version; archived costs are not assigned to unrelated projects. An incorrect historical mapping would require explicit administrative reconciliation, never an automatic reassignment.
2. Pin template revisions and preserve values through explicit synchronization. New requirements apply on creation or relevant metadata edits; existing unsets survive unrelated edits. A mistaken template definition can be corrected through a new revision without deleting recorded values.
3. Show province/category aggregates using existing licensed polygons. No coordinates or milestone dates are invented; exact point mapping remains unavailable without reliable coordinates.
4. The reviewer labelled hidden custom-filter controls Minor; their effect was regraded Important and repaired because filtered results could appear unfiltered. No review findings were deferred. Deployment, restoration and exhaustive historical coverage were not certified by the reviewer; release evidence and stated test limits remain the implementer's responsibility.

Keep additive database migrations on application rollback. The metadata-retention trigger prevents old clients from silently removing template fields. Preserve new data and prefer forward correction over reversing populated schema. Never restore a snapshot over newer production work without reconciliation.

## Requirement acceptance

| Requirement                            | Result                        | Evidence                                                                                                                |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R1 Storyline                           | PASS                          | Dedicated selector/deep links; dated/undated chronology, private documents, refresh and version journeys                |
| R2 Board cost ownership                | PASS                          | Exact amounts/units, roles, CAS, cancel/reload, read-only historical Locker records and retired-write rejection         |
| R3 shared Map                          | PASS                          | Same shared component/predicate; filter/list/URL and bounded rendering checks                                           |
| R4 category representation             | PASS                          | Canonical categories plus Uncategorized; mixed and unknown-location reconciliation                                      |
| R5 UI/workflows                        | PASS within recorded coverage | 295-case inventory, targeted follow-ups, responsive and cross-browser checks                                            |
| R6 templates                           | PASS                          | Immutable revisions, admin-only publish/sync, version conflicts, stable identities, inactive values and required unsets |
| Recovery/release                       | PASS                          | 47-table restore, guarded migrations, exact-build promotion,21 held +21 public +3 cleanup checks                        |
| Platform runtime-log scan              | BLOCKED                       | Both observability APIs403; CLI unavailable                                                                             |
| Signed-in production mutation journeys | NOT RUN                       | Production checks intentionally avoid synthetic live records/files                                                      |

The full browser run initially encountered obsolete Locker financial expectations and was interrupted while those tests were ported. Successful cases were retained, affected files rerun, and remaining cases reconciled individually to the295-case manifest. One overlapping runner left an interrupted tail after a NUL gap in its shared raw log; its final94-case run is extracted separately, and Playwright's final status records no failed tests. The per-case report cites passing evidence without treating interrupted failures as passes. No claim is made that every possible defect or future historical dataset has been exhaustively tested.
