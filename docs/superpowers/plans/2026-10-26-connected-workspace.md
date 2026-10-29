# Connected workspace implementation ledger

Approved specification: user request “Evolve: A Connected, Reliable Project Workspace”, 26 October 2026.
Baseline: 8a746c5. Execution stays on the existing task branch `work`; no production mutation is authorized by this implementation request.

## Deliverables

- [x] 1. Container-responsive document controls and attachment regression.
- [x] 2. Assets, CSV preview/merge, quality workbench and project connections.
- [x] 3. Canonical project/task transition and recoverable legacy archive.
- [x] 4. Shared synchronization, project hub, search, drafts and remembered context.
- [x] 5. Document versions, meeting snapshots and personal actions.
- [x] 6. Local regression, accessibility, scale, independent review and exact local held-build verification.
- [ ] Release gate: production-equivalent provider recovery/cutover evidence, dependency resolution/fresh decision, and hosted held-build verification before promotion.

## Constraints

Project is canonical. Assets and tasks are sibling relationships. One project per asset. Required project per task; subtasks inherit. Board stages/validity/assets admin-only. Existing members may create meeting packs and tasks. Shared private 1 GB storage, 25 MB documents; no provider change. Historical records retained. No comparisons between meeting snapshots. All writes guarded and versioned; import preview rechecked at commit. No silent overwrite.

## Evidence and rulings

- Setup: clean baseline on existing task checkout; runtime dependencies already installed. Follow existing repository patterns and migration checksums.
- Preflight: task identity and archive work affect files, calendar, counts and search; archive boundaries must be implemented before exposing canonical Locker creation. Document version changes must preserve quota allocation and Board review triggers. Snapshot data is intentionally immutable, outside live synchronization.
- Attachment RED: desktop popup filename width was 0px. GREEN: 4 intermediate/desktop widths passed (`/tmp/connected-attachment-green.log`). Baseline 260/260 tests passed.
- Assets domain: five real database cases passed, covering admin boundaries, version conflicts, atomic assignment/import and stale preview rejection.
- Browser asset fixture initially lacked new migration; preparing disposable localhost test databases before browser verification. No production database was touched.
- Transition rehearsal: immutable JSON archive reconciles source rows before moving them out of active tables. Original IDs and ready attachment bytes remain. Active Calendar leases block activation; legacy Calendar cleanup is excluded. Real database transition case passed.
- Ruling: keep a database-maintained Locker project projection keyed by the canonical Board UUID, guarded against independent writes — existing task FKs and task features stay compatible; Board remains the sole author of shared identity. Cost if wrong: projection drift; triggers, version tests and reconciliation cover this boundary.
- Connected service tests passed: seven-day account-scoped draft envelopes, project/task search and hub counts, immutable meeting snapshots and duplicate-free action retries. Added request-payload hash verification after a separate RED replay test.
- Document replacement test passed with actual local upload bytes: old current remains during upload; stale finalization rejected; ready history and admin restoration verified.
- Canonical CSV test passed: stable project UUID identity and asset codes; default export excludes retired Scope. Legacy parser retained for explicit compatibility.

- Ruling: restore subtasks and prerequisites only in the canonical shared-project workflow — legacy/demo behavior stays compatible while shared projects enforce cycles, inherited identity and completion boundaries. Cost if wrong: teams must resolve unfinished prerequisites before completing dependent work; validation explains the restriction.
- Rapid-close draft recovery RED reproduced loss before the debounce. Cleanup/pagehide now flushes pending text without re-creating saved drafts; browser GREEN pending.
- Assets/import receipt tests now cover replaying a request ID with changed input, blank-preserving repeat imports, and project-version conflicts after assignment changes.
- Full first Chromium finding sweep: 272 passed, 26 failed, 8 interrupted/not run. Several tests depended on intentionally retired Scope/checklist UI or automatic draft restoration; contract updates retain behavioral assertions. Other findings repaired: project-tab URL state, document refresh stale state, search accessible label, initial SSE duplicate refresh.

- Independent whole-branch review of 8a746c5..5e8afaf returned five Important findings, no Critical findings or deferred minors. All entered one fix pass: archived draft cleanup; recovered project/asset base versions; pending replacement versus deletion; historical-deletion permission race; existing-task recovery. Reviewer declined production/provider, contention, browser/accessibility and scale judgment; these remain author verification/release gates, not assumed successes.
- Review RED: three database tests reproduced cleanup failure, resurrection after current deletion, and a member deleting a version that became historical before its lock. GREEN: all six transition/version cases passed after archived-row exclusion, migration 0036 pointer invalidation and under-lock permission recheck.
- Draft RED: asset recovery overwrote newer edits, project recovery overwrote newer figures, existing tasks created no record-scoped draft, and keys conflated different task IDs. Implemented original base versions and existing-task recovery. Browser GREEN requires the next held build; task draft/domain cases passed.
- Additional verification: operations metrics used the global DB instead of the supplied connection. Existing isolated integration test failed; supplying the same DB made both operations cases pass. Archive activity/expense visibility failed before the paged read API/UI and passed afterwards. Local rollback now retains post-cutover Board-linked tasks alongside restored legacy IDs and actual private file bytes.
- Domain pass at intermediate reviewed source: 283/283. Rapid-close browser draft regression passed after flushing on close/pagehide. No production database or provider storage touched.

- Additional integration defects: a held Board refresh changed a newly opened meeting URL (WebKit RED); path/mount checks made all 28 cross-engine canonical journeys pass. Scale exposed URL writes that skipped Next's search-param update; native external URL state and context preservation now pass actual filtered API response checks and the 51-node map bound.
- Replacement preparation now has owner-scoped request receipts (migration 0037). RED rejected the missing request-ID contract; GREEN reuses one allocation, rejects changed payloads and returns an already committed current version. Lost-response browser retry passed. Error cleanup is restricted to pending uploads.
- Read-only asset details RED stayed at the old value after another member's update. Reusable live detail views passed in Chromium, Firefox and WebKit, preserving edit snapshots separately.
- Local gates before the final broad run: 284 domain/integration tests; 14 canonical Chromium journeys; 28 canonical Firefox/WebKit journeys; 8 existing cross-engine critical journeys; 16 affected existing Chromium tests. Scale visited all 1,000 project roots, 10,000 assets and 20,000 tasks; heavy project map rendered 51 nodes. Measured p95 stayed below one second; full figures are in the audit artifacts.
- Production remains unchanged. Provider restoration, production-equivalent archive/cutover rehearsal and exact hosted held-build verification remain external release gates. Fresh npm audit still has four high Blob-chain findings; no previous exception was reused.

- Final: fixed all five independent Important findings — regression cases observed RED→GREEN; final domain suite 284/284, full Chromium 306/306, canonical Chromium 14/14, canonical Firefox/WebKit 28/28, existing cross-engine critical 8/8, scale 1/1. No deferred reviewer minors.
- Final additional fixes are covered by held-response navigation, offline/reconnect, real query-response, read-only detail synchronization and complete-pagination/51-node regressions. Final TypeScript, lint and formatting checks passed; production-mode build `0zCsAuweDM6hspDZaVBCt` tested source `457d565`.
- Local held build: health 200/current schema; anonymous workspace/assets/archive APIs 401. Existing unchanged production: health 200 and protected Locker/Board APIs 401. Neither check created live files or records.
- Source implementation is complete on `work`. Production promotion remains held by the approved external release gates. Final documentation/evidence commit does not change runtime source.

## Production completion — 26 October 2026 UTC

- Advisory resolved with a scoped same-major validator patch and two RED→GREEN contract/security tests. Fresh audit: zero vulnerabilities. Updated domain suite 286/286; full Chromium 306/306 (18.8 minutes). Final TypeScript/lint/format passed; the hosted ordinary production build uses source `d747d8f`.
- Independent recovery-script review corrected runtime isolation by making one-off recovery/migration builds static only. A subsequent migration review found separator mismatch, incomplete old-writer barrier and inconsistent child DB selection; one atomic, same-client transaction with baseline table locks resolved all three. No Important/Critical findings remain in those reviews.
- Managed restore: all32 original public tables matched fingerprints, restore73.347sec, Locker5projects7tasks and3Calendar events preserved. Blob authentication verified; original attachment count0. Isolated cloud CRUD, private versions/downloads, review reset, stale edits/import idempotency and layout checks passed. Six synthetic provider files were verified absent; held allocations released only after expiring their safety window in the disposable fixture.
- Ordinary held production deployment `dpl_FfuBkq32eYMpSxGNnjdR4LkBgQmz` passed14 checks before promotion; source SHA/digest and original production alias were verified. Exact build promoted without rebuild; canonical transition activated through the authenticated same-origin API. Live18checks passed with0browser errors, no synthetic production project/file writes, source documents0 and archive reconciliation5projects7tasks.
- Recovery evidence saved in Operations. Review sessions revoked, five owned temporary deployments removed, eight temporary env vars removed and recovery encryption key restricted to production. Original source snapshot retained encrypted in isolated managed DB; no plaintext/auth material committed.
- Earlier “not promoted” entries above describe the implementation checkpoint before this authorized release. The current authoritative result is production-release.json. Ongoing automatic daily backup scheduling and production latency at scale are not claimed by this one-time rehearsal/local benchmark.
