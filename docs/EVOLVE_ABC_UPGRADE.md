# ABC upgrade execution ledger

Plan: docs/superpowers/plans/2026-10-25-abc-upgrade.md. Base c6cd1ef.

User choices: repairs plus ABC; personal account-synced views; 5k projects/10k tasks; discard warnings without stored review drafts; 4 MiB inline CSV budget; security audit remains blocking; automated-first accessibility with physical-device/screen-reader checks pending.

Status: **PRODUCTION_VERIFIED_WITH_KNOWN_ADVISORY.** On 2026-10-25, after disclosure of the unchanged four high dependency entries for GHSA-mrhx-c7xc-m3w5, the user instructed “Continue to production.” This supersedes the earlier hold for this release only. The dependency audit remains failing and its CI gate remains unchanged. A held migration build and ordinary build must pass staging checks before traffic switches. No dependency downgrade or audit suppression is authorized.

Pre-flight: repairs and A share Board modal/network utilities; B shares the invitation dialog and membership report across both rooms; C validates both sets and uses independent disposable fixtures. No permission model or storage-policy change.

Ruling: use the existing non-main `work` checkout and a repository ledger; cloud skill helper scripts have no local filesystem installation. No task implementation is delegated; one fresh whole-change review follows implementation.

## Repairs

RED: six browser regressions failed in `/tmp/abc-repairs-red.log`; three transport unit cases failed in `/tmp/abc-transport-red.log`. GREEN: eight repair/review browser cases passed; four transport cases passed; complete node suite passed 241/241 at this stage. Pending-save fields are locked, review notes have explicit discard protection and native reload warnings, and imports reject oversized encoded requests before fetch. The five existing formatting failures were formatted without excluding application or archived files from checks.

## A — personal saved views

RED: both new saved-view browser cases initially returned 404. GREEN: both passed after implementation; four isolated database cases passed including concurrent quota attempts, owner isolation, case-insensitive names, optimistic updates and revoked access. Migration 0019 applied only to local evolve_test/evolve_e2e. Account view writes do not increment portfolio revision or change projects.

## B — invitation handoff

Initial unit tests reproduced the missing canonical URL and insufficient direct-service administrator verification. Those two unit cases now pass. Browser tests exposed a stale account-status report after approvals in Board (its portfolio revision does not change on shared membership updates); the shared People report must also react to membership snapshots. Browser verification remains in progress.

B verification: the two canonical-link/admission unit cases and both room handoff browser cases passed. Keyboard focus moves to the sign-in link after approval; blocked clipboard access exposes selectable text. Registration state does not claim online presence or a completed first login.

## C — automated quality and scale

The first scale pass measured Board/task read p95 at 149/59ms and Board filtering at 505ms. Its 1,638ms detail measurement was full cold page navigation, not the in-dashboard action named by the interaction budget. A failing regression also proved deep links fetched the same project detail twice. Server detail is now reused on initial hydration, and that regression passed.

Ruling: measure actual filter/detail interactions against the 1s budget and record cold navigation separately instead of silently applying the interaction threshold to a full document load. Cost if wrong: users wanting a separate <=1s cold-navigation promise need an additional target; no such production promise is made. The corrected pass measured warm Board/task API p95 128/60ms, Board filter p95 450ms, detail-open p95 208ms and cold-navigation p95 1,145ms on the local 3-CPU reference host. Larger exports emit bounded chunks and preserve existing CSV escaping; two new stream tests passed. Locker UI interaction measurements are being added to the same fixture run.

Cross-browser: eight critical Firefox/WebKit cases passed, covering keyboard/personal views, both invitation handoffs, responsive axe checks and real local private-file upload/download. A serious visible-label/name mismatch in the new view button was fixed after the initial cross-browser failure. One clipboard test used label text containing a textarea's initial content; it now queries the actual accessible textbox name consistently across engines.

Ruling: this host cannot install system libraries as root. Signed Debian packages were extracted into a temporary local runtime/browser cache; actual Firefox/WebKit launches and tests succeeded. The local dependency preflight was bypassed because its system library cache does not see these private runtime libraries. Application tests were not skipped. Cost if wrong: local runtime setup can differ from standard installations; CI uses normal `playwright install --with-deps` without the bypass.

Current whole-domain suite: 249/249 passed. Repository-wide format check and lint passed at this stage. Full final regression, fresh review and security-gate result remain pending.

Additional A/repair verification: all eleven browser cases passed, including native reload cancellation, rename focus, stale-version refresh/retry, update/delete and successful writes surviving a failed follow-up list refresh. Failed refreshes are distinguished from failed saves; the known returned view remains visible.

Security gate: fresh production-dependency audit still reports four high package entries for GHSA-mrhx-c7xc-m3w5, zero critical. The registry still reports Blob 2.8.2 as latest. No exception, downgrade, provider change, production migration or deployment is applied.

Final scale pass passed for both apps: Board/task API p95 134/58ms; Board filter/detail p95 485/228ms; Locker filter/detail p95 552/491ms. Separate cold Board navigation p95 was 1,030ms. Twenty samples were measured per UI action, 100 per API with five concurrent readers. Export exceeded the platform's buffered-body allowance and completed via the streamed API. Evidence: [synthetic benchmark JSON](audit-data/abc-scale-2026-10-25.json). These are automation measurements on the recorded local host, not production field latency or Core Web Vitals guarantees.

Public interfaces: `/api/board-room/views` supports private GET and owner-only POST/PATCH/DELETE with twenty views/account, forty-character names, case-insensitive duplicate rejection and optimistic versions. Snapshots contain portfolio query fields except pagination, section and layout; applying starts at page one. `inviteMember` responses add a canonical `onboardingUrl`; `/api/administration` adds `accountRegistered` without reporting online presence. CSV POSTs are limited to 4 MiB encoded requests; the 15-column format is unchanged and large CSV responses stream in bounded chunks.

Rollback: previous application code can ignore migration 0019. Preserve its table and user views instead of dropping it. No production migration or release has occurred. Physical-device and manual screen-reader review remain explicitly pending under the selected automated-first policy.

## Fresh whole-change review and one fix pass

The independent reviewer found three Important issues: client-side connected/shareable links bypassed the review-note guard; PostgreSQL query-string host overrides bypassed the scale fixture's hostname check; and test servers could inherit Blob credentials. The reviewer also identified a section-only saved-view URL bug.

Ruling: regrade the URL issue as Important because reloading or copying a saved view must restore its selected section. It is fixed, not deferred. Cost if left unfixed: a saved Projects view would silently reopen Overview.

All four findings received regressions before repair. Three fixture-safety cases failed then passed, and three navigation/section cases failed then passed. The final fourteen-case repair/view browser run passed. Both review notes survive canceling in-app navigation; explicit discard permits it. URLs update independently of whether filters need refetching. Scale URLs now require a plain PostgreSQL localhost URL without query overrides/fragments, and test-server environments explicitly clear Blob credentials. The current test parent has no configured Blob token. Critical upload tests also reject a non-local reservation before transferring file bytes.

No Critical findings were reported. No reviewer minors remain deferred. Production streaming behavior, physical-device/screen-reader behavior and upstream advisory remediation remain outside the verified local evidence; those are reported limits, not green claims.

Post-review verification: 252/252 domain/database cases passed; eight Firefox/WebKit critical cases passed with local-provider enforcement; types, lint and full formatting passed. The quiet, reviewed scale rerun also passed: Board/task API p95 172/53ms; Board filter/detail 514/212ms; Locker filter/detail 583/590ms; separate cold navigation 1,174ms. The benchmark JSON now records that final rerun. Full Chromium verification is the remaining local regression gate.

Visual acceptance found two additional phone defects that overflow-only checks did not detect: names were squeezed into a narrow saved-view column, and the post-approval handoff had no inner padding. Both received failing layout tests, then passed at 320, 390, 768 and 1440px after grid/padding fixes. Icon actions retain 44px targets and handoff buttons wrap within the phone panel. The earlier Chromium sweep was deliberately interrupted after 92 passes (one interrupted, 197 not run); it is not reported as a completed sweep. A full final sweep will be restarted after these visual repairs.

Local disposable-workspace screenshots show the actual UI with synthetic example records, not production data: [Board views desktop](screenshots/abc-board-views-1440.png), [Board views phone](screenshots/abc-board-views-390.png), [handoff desktop](screenshots/abc-handoff-1440.png), [handoff phone](screenshots/abc-handoff-390.png).

## Final acceptance — 25 October 2026 (Asia/Bangkok)

| Check                                                       | Final result                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Full Chromium production-build suite                        | **292/292 passed**, 15.3 minutes                                                                                |
| Domain/database suite                                       | **252/252 passed**                                                                                              |
| Firefox/WebKit critical journeys                            | **8/8 passed**, including phone readability, axe, keyboard, clipboard recovery and local private-file transfers |
| Type checking, lint, repository formatting, diff whitespace | Passed                                                                                                          |
| Quiet final scale fixture                                   | Passed: 5,000 Board projects, 10,000 Locker tasks, 1,000 synthetic local files                                  |
| Local PostgreSQL recovery                                   | All **32 tables** matched counts/content fingerprints; synthetic file checksum matched                          |
| Dependency security gate                                    | **BLOCKED**: four high package entries, one upstream advisory; no exception                                     |

Final scale p95: Board/task API **138/61ms**; Board filter/detail **519/244ms**; Locker filter/detail **618/533ms**. All targeted interactions remain below 1 second. Full cold Board navigation was measured separately at **1,099ms**. These values describe the recorded local reference machine, not production field measurements.

Evidence: [scale](audit-data/abc-scale-2026-10-25.json), [recovery](audit-data/abc-recovery-2026-10-25.json), [security gate](audit-data/abc-security-2026-10-25.json). The 947ms local drill is not a production RTO or a real Blob recovery test. Actual-device and manual screen-reader review remain pending as explicitly selected.

Application implementation is committed on `work` through `ab52cac` (following `c8b7fd4` and `6cc2599`). The last acceptance changes were phone-only layout repairs, covered by two failing-then-passing layout regressions and the final full suite. All fresh-review Important findings were repaired and regression-tested; the URL item was regraded and repaired rather than deferred. No review minors remain deferred.

Production was read-only checked after acceptance: `/api/health` returned 200/ready; the domain still maps to READY deployment `dpl_E5rneESsRJmVXUosgiowUC4KTqJX`, source `a8a7d078ea382a8a18798e10d5985b5b8ae1b2a5`. Migration 0019 has not run in production and this upgrade has not been deployed. The branch/workspace is preserved for the supported dependency fix and later release; there is no merge, push, new paid resource or external invitation delivery.

## Production release — 25 October 2026 13:31 UTC

ABC is live at https://evolve-rensist.vercel.app/workspace. Application source `9dbf8aab48936be8ab15bc53704bf54da1901785`; READY deployment `dpl_2xvyaoUfSeaSQEDuvi3XhGiesZ9B`; ordinary-build source digest `d11df3a4fce6785157405b45457433fe75fdc8c3b518d0f223d709e56826649a`. Migration `0019_board_saved_views.sql` was confirmed applied in the held migration build. The ordinary production build used the same reviewed commit, passed staging checks, and was promoted without rebuilding.

Staged and canonical-domain smoke checks each passed **28 health/access/origin/browser checks**, plus the exact public 15-column CSV template comparison. This includes saved-view GET authentication and POST/PATCH/DELETE origin rejection, private cache behavior, Operations boundaries, login redirects, and desktop/390px demo rendering without horizontal overflow or JavaScript errors. These are anonymous live checks; authenticated CRUD remains covered by disposable local tests, not fabricated production sessions.

Source metadata, READY state and canonical alias mapping were independently checked. Automatic domain assignment was restored to its previous setting; temporary platform review access was revoked and its local access file removed. Previous deployment `dpl_E5rneESsRJmVXUosgiowUC4KTqJX` remains the rollback reference. Preserve additive table `board_saved_view` during an application rollback. No production project fixtures, invitations or external messages were created.

The user’s latest production instruction superseded the earlier security hold for this release only, after disclosure. **The audit still fails: four high package entries for GHSA-mrhx-c7xc-m3w5, zero critical.** CI’s blocking audit command and dependencies are unchanged. Historical blocked acceptance/security records above remain accurate for their original checkpoint. Physical devices/manual screen readers, provider retention, production/Blob restoration and production scale measurements remain unverified. See [sanitized production evidence](audit-data/abc-production-2026-10-25.json).
