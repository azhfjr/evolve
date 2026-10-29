# Operations and stage-policy delivery

User decisions: admin-dashboard alerts first; recovery targets RPO 24 hours / RTO 4 hours; enforce jump/reversal reasons in UI and API; future document versions retained until explicit admin removal. No external notification delivery, provider change, quota increase or production restore is included.

- [x] Implement bounded, admin-only Operations state and aggregate signals.
- [x] Add best-effort authenticated maintenance heartbeats without changing cleanup/Calendar semantics.
- [x] Add recovery-evidence form, conflict handling, incident acknowledgment and explicit unverified boundaries.
- [x] Enforce reasons for exceptional existing-project transitions, including completion reopening and CSV overrides.
- [x] Repair progress-review drafts and failed-stage retry behavior using failing browser reproductions.
- [x] Review invitation admission, revocation and shared-room access paths.
- [x] Independent code review; fix in-flight recovery-evidence race.
- [x] Reproduce and fix 320px shared-header overflow.
- [x] Complete full browser sweep, local recovery drill and final verification ledger.
- [x] Commit reviewed source and apply additive 0018 through a held migration build.
- [x] Verify an ordinary exact-source build, promote it, check live boundaries and revoke temporary platform review access.

Rollback: the previous application can ignore the additive Operations table; preserve it and its data. Do not drop the table or reverse unrelated JSON metadata as a rollback shortcut. Recheck source compatibility before choosing a previous build. A rollback would also restore its older permissive stage-reason behavior, so a forward repair is preferable for that policy.

Production verified 25 October 2026 04:44 UTC; application source `a8a7d078ea382a8a18798e10d5985b5b8ae1b2a5`, deployment `dpl_E5rneESsRJmVXUosgiowUC4KTqJX`. Staged/live checks passed; review access revoked; domain assignment restored.
