# Document workflows — production release

**Status: published and production verified under a new user-authorized one-release security exception.** Final application source `a392d7b06ff06e3a1ef8c2f09f725ce1a5430459`; READY production deployment `dpl_3EsxqXr6wwPTVF5GxAGxRA8s6ZRP`. The exact held build was promoted without rebuilding; it replaces `dpl_EMDAibgfmjhsQLWqsL1Mc85mFDHx`. Additive migration `0020_attachment_purpose.sql` is confirmed applied; old application behavior remains compatible.

## Delivered

- Optional documents in Board Room creation, uploaded after saving the project, with the existing progress template, cancellation, partial-success recovery and retry against the same project.
- One purpose per document: Reference, Meeting Notes, KKP, KKO, KKF, Simulation Files or Other. Existing files remain Unlabelled. Owner/admin and Board-admin permissions are preserved.
- Individual downloads and project ZIP downloads, including Locker task attachments. Shared Settings exports both apps regardless of filters; selected downloads and room-specific menus retain their scopes. ZIP parts contain up to 100 MiB of source documents or 100 files, plus headers and a document index; no archive consumes server storage.
- A shared Files inventory with app/purpose filters, separate project/task, uploader, size, status and date columns, consistent typography, sticky headers and contained scrolling. Native dropdowns and readable phone controls match existing components.

## Verification

| Check                                                                  | Result                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| Complete domain/database suite on final source                         | 260/260 passed                                    |
| Broad Chromium regression on source `5d6c779`                          | 304/304 passed,17.4min                            |
| Final Chromium document/import checks after isolated label-refresh fix | 10/10 passed                                      |
| Final Firefox and WebKit workflows                                     | 22/22 passed                                      |
| Type checking, lint, repository formatting and diff whitespace         | Passed                                            |
| Final held deployment health/access/origin/browser checks              | 33/33 passed, plus unchanged 15-column CSV header |
| Existing production smoke after staging                                | 28/28 passed, plus CSV header                     |

The final source followed the broad sweep with one isolated Board label-success/failed-refresh callback fix. The expanded focused suite and both additional engines exercised that final callback; server/API logic did not change after the broad source. Local cross-engine runs used private extracted libraries and bypassed host-library validation, while launching and executing the real engines; no tests were skipped.

Tests use disposable local fixtures. Authenticated production records/files were not fabricated. Real OAuth consent, physical devices/manual screen readers and production/provider restoration were not revalidated by this feature release. Temporary platform review access is revoked, its local access file removed, and automatic-domain settings are restored after READY. The current production alias was independently confirmed unchanged.

## Defects caught and repaired

1. Archive dialogs retained old progress after reopening; reset transfer state.
2. Cancelled archive operations could update a new session; guard asynchronous updates by controller identity.
3. Added filters compressed File status to 36px; use wrapping columns with at least 180px controls and a single phone column.
4. Creation dropdowns squeezed phone filenames to 65px; stack purpose beneath readable filenames (248px in the 390px preview).
5. Unlabelled filtering included profile/branding images; exclude non-document entities from that filter.
6. Shared Download all followed the app filter; keep the shared export workspace-wide.
7. A confirmed Board label could appear unsaved and raise a browser error if subsequent refresh failed; apply the successful response immediately and handle refresh failure separately.

All have failing-then-passing regressions or recorded browser reproductions. Fresh review findings were fixed; no Critical/Important finding remains deferred. The CSV-history test also required correction: two valid batches can share summary text, so it now verifies the new batch ID and newest rendered row.

## Release decision still needed

The audit still reports four high package entries and zero critical, all linked to [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Vercel Blob 2.8.2 remains the latest checked release; npm suggests an SDK downgrade, which the existing policy excludes. Dependencies were not downgraded or overridden and the CI audit gate was not weakened. The user selected **A** after the final audit, granting a new exception for this release only. The four high dependency entries remain unresolved; the CI audit gate remains unchanged.

[Sanitized release and verification evidence](audit-data/document-workflows-2026-10-26.json)

## Native UI screenshots

All show synthetic local data. Creation screenshots show selected browser files, without saving a project or uploading them.

- Creation: [desktop](screenshots/document-creation-1440.png), [phone](screenshots/document-creation-390.png).
- Shared Files: [desktop](screenshots/document-files-shared-light-1440.png), [phone](screenshots/document-files-shared-light-390.png), [dark](screenshots/document-files-shared-dark-1440.png).
- App Files: [Locker desktop](screenshots/document-files-locker-light-1440.png), [Locker phone dark](screenshots/document-files-locker-dark-390.png), [Board phone dark](screenshots/document-files-board-dark-390.png).

## Compatibility and interfaces

Migration 0020 adds a nullable checked purpose column. Existing upload clients can omit purpose. New label PATCH requests send purpose plus expectedPurpose for conflict protection. An authenticated archive-manifest POST handles project, workspace and selected-file scopes; content is reauthorized through existing private download routes. File inventory adds room=all and purpose filtering; deletion APIs remain room-scoped. Existing file formats, 25 MB document limits, shared 1 GB quota and 15-column project CSV contract remain unchanged.

## Execution record

# Document workflows execution ledger

Approved design: Board creation uploads on Create; one purpose label (Reference, Meeting Notes, KKP, KKO, KKF, Simulation Files, Other); existing files Unlabelled; project ZIPs include Locker task attachments; shared Settings exports both apps; consistent Files table. Base c7b539f. Existing non-main work checkout, inline execution with TDD and one fresh final review. Cloud skill scripts are not installed locally; use this ledger for equivalent evidence.

Tasks: data/authorization and archive manifest; bounded client ZIPs and controls; upload/label UI and Board creation queue; shared table redesign; regression/visual/accessibility verification; held release.

Constraints: shared 1 GB allocation, private storage, no extra archive storage, 25 MB documents, 100 MiB/100-file ZIP parts, preserve per-app deletion boundaries. New migration is additive. Prior security exceptions do not authorize a new release.

Pre-flight: attachment metadata is consumed by Board details, task drafts, generic uploads and managed inventory; all must carry purpose. Purpose-only changes must not reset Board review. Shared list scope changes only in shared Settings, never in room deletion APIs. ZIP contents reauthorize via existing private endpoints.

Data tests: reservation purpose initially failed as unsupported, then passed. Initial full node run exposed six attachment tests using a disposable PostgreSQL schema without migration0020; prepared only evolve_test/evolve_e2e, then all259 node cases passed. Native Board creation/label persistence, partial-upload retry (one project creation), exact ZIP contents/index and auth/origin tests passed.

Fresh review found no security/authorization defects and two download-dialog state defects (stale phase on reopening and stale async updates from a previous cancelled operation). Regraded both Important: users must trust transfer status. A cancellation/reopen browser test reproduced the stale progress before the fix. One fix pass resets state and guards every async update by controller identity. No deferred findings. ZIP caps apply to100MiB source bytes/100 documents; ZIP headers and the index are additional expected overhead.

Visual inspection after the first full sweep started caught a real filter-layout defect: the shared toolbar's old five-column grid compressed File status to 36px. A live local read-only browser assertion failed with that exact width. Stopped the sweep, replaced the fixed slots with wrapping minimum180px columns and a single phone column, and added width assertions across all app/theme/viewport combinations. The interrupted sweep is not counted as a complete pass; a fresh full sweep follows.

Own final audit also found that the Unlabelled filter matched profile/workspace images even though purpose labels do not apply to them. A new regression failed on that inclusion; the predicate now excludes shared images for the Unlabelled filter while retaining them under All purposes. This stays within the single final fix pass. The toolbar width/typography regression passed all app/theme/viewport combinations after the grid fix.

Verification checkpoint (26 October 2026, Asia/Bangkok): the interrupted full sweep had114 passes, one interruption and189 not run; it is not acceptance evidence. The corrected width regression then passed in Chromium against all three Files pages, light/dark themes and320/390/768/1440px. A fresh304-case full sweep is running, log `/tmp/documents-full-final.log`; final node/lint/format logs are `/tmp/documents-final-{node,lint,format}.log`. Cross-engine verification will follow sequentially because all browser suites share the disposable evolve_e2e database and build output. No authenticated production fixtures will be created.

Final scope audit found shared Settings Download all inherited the app filter, contrary to the approved workspace-wide behavior. A read-only browser regression captured `{kind:workspace,room:board}` after selecting Board; corrected Download all to omit room in shared Settings regardless of filters. Added the request assertion to the existing shared Files test. Room-specific menus and Download selected retain their scoped behavior. The in-progress sweep was stopped again before acceptance; final acceptance must use the later clean run only.

Implementation checkpoint: all260 domain/database tests and all seven focused Chromium document workflows passed after the final filter and workspace-export fixes. The304-case full acceptance sweep is running at `/tmp/documents-acceptance-chromium.log`; do not mark it complete until its final result is read. Source can be staged without traffic while that regression run finishes. Deployment uploads must use immutable committed bytes so test-generated screenshot updates cannot change the reviewed build. No production promotion is authorized by prior one-release exceptions.

Final creation-form screenshot review found selected filenames squeezed to 65px on phones by the adjacent purpose selector. A local read-only browser assertion failed on that exact width. Added a phone-only three-column file-card grid, moving purpose below the filename, plus320/390px filename-width assertions. The in-progress full functional sweep continues against the already-built application; after it finishes, final scoped-CSS acceptance runs the seven document journeys and both additional browser engines against the final source. No server/API/business logic changed after source1de4093; held deployment must be superseded with the final CSS build before release review.

Completed broad sweep:303/304 passed in16.7min; the only failure was the CSV-history test's strict selector matching two legitimate batches with identical totals. Strengthened that test to observe a new batch ID in the automatic history refresh, verify its counts, and assert the newest rendered row instead of globally matching nonunique summary text. This is a test correction, not a production import change. Full acceptance is rerun against the final scoped phone CSS and corrected test.

Final focused verification:10/10 document and CSV-evidence browser cases passed against the final phone grid and corrected import-history assertion. New full sweep log is `/tmp/documents-all-green-sweep.log`. The strengthened six-case document domain suite also confirms purpose-only changes preserve an actually reviewed Board project. The earlier held candidate is superseded by a final ordinary build; migration0020 bytes remain unchanged and already verified applied.

Failure-path audit reproduced an Important label-save bug: a successful Board purpose PATCH followed by a failed detail refresh left the old label visible and emitted an unhandled browser error. Local read-only mocked reproduction showed Reference instead of confirmed KKF and pageErrors=[Simulated refresh failure]. Updated Board details from the successful response immediately, handling dashboard refresh failure separately. Expanded the existing ZIP/label browser case to verify confirmed labels survive failed refresh without page errors, then reload and download the real stored label. A final source verification follows; earlier staged candidates are superseded.

Broad functional acceptance completed:304/304 Chromium checks passed in 17.4 minutes against source `5d6c779`. The isolated Board label-success/failed-refresh fix followed that run and passed the expanded10/10 focused document/import journeys against its final source. Server/API/business rules did not change after the broad acceptance source; the final source differs in the Board label callback and its regression. Final Firefox/WebKit and domain/static checks run against the final source. Report the broad baseline and final focused checks separately rather than implying one broad run covered the later callback change.

## Production publication

The user selected A to publish the verified candidate with a new one-release security exception. Promoted the exact READY deployment without rebuilding. All **33 live health/access/origin/browser checks** and the exact 15-column CSV template header passed, with zero browser errors. Independently verified the canonical production alias, application source SHA/digest, readiness, restored automatic-domain setting and revoked temporary review access. No synthetic files or authenticated fixtures were created in production. Earlier held-state entries above are historical checkpoints superseded by this publication.
