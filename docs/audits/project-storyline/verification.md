# Project Storyline and shared project forms — verification

Implementation source through `50fc13c`; approved specification: `docs/superpowers/plans/2026-10-28-project-storyline.md`.

## Delivered behavior

- Planned COD dropdown offers 2026–2040. Direct saves and both CSV paths enforce new/changed assignments while retaining unchanged historical years. Canonical Locker projections now accept Board's historical read range; legacy Locker-only validation remains unchanged.
- Asset fields have contextual guidance, explicit accessible names and linked descriptions.
- Optional Document Date is calendar metadata on a logical document, independent of upload timestamps. Admin metadata edits use version checks and preserve document review; replacements/restores retain the date.
- Project-only Storyline is shared between Board project detail/popups and Locker canonical project documents. It contains current ready Board documents, separates Undated documents and excludes task attachments. Stable pages, complete counts, sort selection, private downloads and existing revision history remain available.
- Editors survive remote movement between dated/undated groups. Live refresh retains explored pages and focused entries. Active project tabs remain visible after narrow-screen resizing without moving keyboard focus.
- Locker canonical project Download all includes shared project documents and task attachments. Board exports, workspace/app Files scopes, archive permissions and current-version defaults remain intact.

## Confirmed defects repaired

Historical COD writes could fail in Locker's canonical mirror despite unchanged Board values. Refreshed rows could unmount an unfinished date editor; refresh also discarded pages beyond the first 50. Canonical Locker archives omitted task files. Mobile resizing could leave the selected tab offscreen. Helper content initially altered accessible field names. Each functional repair has a focused regression; new date behavior has persistence/concurrency/permission coverage.

## Observed verification

| Check                                                | Result                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Domain/integration suite                             | 328 passed                                                                                        |
| Full Chromium regression                             | 306 passed; final scoped repairs additionally covered below                                       |
| Final Storyline/project workflows, Chromium          | 7 passed, including private ZIP content and native 200% zoom                                      |
| Final Storyline/project workflows, Firefox/WebKit    | 12 passed; two Chromium-only native zoom cases intentionally skipped                              |
| Canonical connected workflows and draft recovery     | 14 passed                                                                                         |
| Revision replacement/private history, Firefox/WebKit | 2 passed                                                                                          |
| Regional mapping/charts                              | 9 passed, including API reconciliation and zero states                                            |
| Principal route audit                                | 3 passed across Chromium, Firefox and WebKit; both themes, font scales and phone/desktop layouts  |
| Responsive screenshots                               | 320, 390, 768, 1024, 1440 and 1920 px; both themes in all three engines                           |
| Native Chromium zoom                                 | Both project Storylines at actual 200%; 720 CSS px within a 1440px viewport, no document overflow |
| Accessibility                                        | Storyline axe checks passed; principal-route checks and keyboard/focus assertions passed          |
| Type checking and lint                               | Passed                                                                                            |
| Dependency audit                                     | Zero advisories, including development dependencies                                               |

Full Chromium regression ran before the final isolated fix pass; final affected workflows were rerun in all three engines. The complete 328-test domain suite passed again after all final application changes; viewport assertions cover the navigation repair. The final standalone production build passed, and Vercel built the held candidate successfully.

## Recovery and data integrity

An encrypted, consistent production snapshot was restored into a temporary local database. All 47 table hashes reconciled. The exact migration transaction for `0038_document_dates.sql` and `0039_canonical_historical_cod.sql` preserved historical rows, current pointers and upload metadata. No date backfill or file-content change occurred. Temporary rehearsal databases were removed. See `migration-rehearsal.json`.

Keep the additive date column and canonical projection compatibility constraint when rolling application code back. Recovery ciphertext/key remain restricted, ignored release artifacts; credentials are excluded from source and reports. The application retains PostgreSQL and existing private attachment storage; HTTPS was used only by release tooling because direct TCP access from this environment was unavailable.

## Independent review and limits

Independent review of `251e903..ca47d8e` found no Critical or Important findings. Follow-up fixes were verified through failing-then-passing regressions and the suites above.

One Minor remains deferred: if a remote change removes the date editor's original row, closing the preserved editor can return keyboard focus to the document body because the old trigger is disconnected. No input or stored data is lost. This is not a claim of complete assistive-technology coverage.

Google consent completion and live external Calendar writes were not performed. Provider integrations use disposable test fixtures/mocks where appropriate. Production checks are read-only health, access, route and static-asset checks; they do not create projects, files or synthetic application sessions. Platform runtime-log access is checked separately from application health.

## Release

Live at https://evolve-rensist.vercel.app. Promoted the exact verified held build `dpl_HEug9h7EGT5XBUd5R3H5xrCBzWSo`, source `49befd13bd5a8682c010e28f6bce4966428fb210`, source/deployed digest `a334b6db3051cb0d524780da7ae119acad88895d3799afa5dfa3b78b2ed73445`. Both held and canonical checks passed 15/15 with zero browser page errors. New private Storyline/metadata boundaries, health, retired routes and geography checksum were checked. See `held-verification.json`, `production-verification.json` and `production-migration.json`.

The initial route verifier reused a page across streamed sign-in redirects; `goto` returned no response for Locker Room. Direct responses were 200. The verifier now uses independent pages plus explicit HTTP checks, matching the route-audit method; its strict complete held/public runs pass. No application error was suppressed or production records created.

Normal automatic domain assignment is restored. Temporary review access is revoked and temporary database credentials were removed from the execution workspace. Rollback target `dpl_33A7Uf61RggcjcQvwMda55vB9JgD` remains retained. No synthetic production projects/files/sessions were created.

Runtime logs and runtime-error queries both returned 403. No Vercel CLI is installed. This limits platform-log inspection; it is distinct from the verified application health/access checks and is not a clean-platform-log claim.

## Recorded implementation decisions

- Kept the existing isolated `work` branch and host workspace; no merge, push or PR was requested. The risk of shared-worktree interference was checked through clean initial state and scoped diffs.
- Reused logical document versions and workspace revisions. Conservative invalidation can refresh a chronology after unrelated workspace changes; explored pages and unfinished input are retained.
- Added the canonical-only historical COD constraint repair after reproducing a mirror failure. API/import validation remains the new-assignment boundary; a future write path must reuse that guard.
- Used explicit recovery, held-build and production checks for the operational judgments the independent reviewer declined. Untested external-provider journeys and unavailable platform logs remain disclosed above.
