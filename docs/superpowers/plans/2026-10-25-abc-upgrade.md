# Balanced upgrade: repairs + A, B, C

Approved 25 October 2026. Base: c6cd1ef. Implement inline, then obtain one fresh whole-change review.

1. Repair pending-save draft races, Board discard protection, bounded CSV requests and non-JSON errors. Repair the five formatting failures.
2. A: private, account-synced Board saved views: create/apply/rename/update/delete; twenty per account; forty-character names; query/section/layout snapshots; page one on apply; concurrency and owner isolation.
3. B: persistent approval handoff with canonical sign-in link and copyable instructions; accurate registration/session labels across both rooms; no email delivery.
4. C: isolated 5,000-project / 10,000-task benchmark; warm read p95 <=750ms at five concurrent clients/100 requests, filter/detail p95 <=1s; full Chromium and critical Firefox/WebKit/keyboard/axe coverage. Actual device/screen-reader testing is explicitly pending.
5. Independent review, repairs, full verification and handoff. Production release stays blocked while the dependency audit fails. No audit exception or SDK downgrade.

Review notes are not stored in browser storage. Warn on closing/editing with unsaved notes and use native reload/tab-close protection. CSV requests use an exact encoded 4 MiB ceiling with conservative preview/commit allowance. Existing categories, sidebar, permissions, CSV columns, provider and shared quota remain intact. Additive migration only in disposable local test databases until the release gate passes.

See docs/EVOLVE_ABC_UPGRADE.md for execution evidence and outstanding gates.

## Completion

Implementation and local acceptance completed on 25 October 2026 (Asia/Bangkok). Final evidence: 292 Chromium cases, 252 domain/database cases, eight Firefox/WebKit critical cases, both-app scale budgets and a 32-table local restore all passed. Fresh-review findings and phone-layout findings were repaired with regressions. Types/lint/format passed. The existing security audit remains blocking under the explicit user choice; no production migration/deployment or merge/push was performed. See the execution ledger for exact scope, measurements, screenshots and limits.

Production verified 25 October 2026 13:31 UTC; application source `9dbf8aab48936be8ab15bc53704bf54da1901785`, deployment `dpl_2xvyaoUfSeaSQEDuvi3XhGiesZ9B`. Staged/live smoke checks passed, migration 0019 confirmed, domain assignment restored and temporary access revoked. Latest user production authorization superseded the earlier hold for this release; dependency audit remains failing and unchanged. See `docs/EVOLVE_ABC_UPGRADE.md`.
