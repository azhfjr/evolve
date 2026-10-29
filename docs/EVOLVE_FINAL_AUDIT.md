# Evolve reliability and product audit — 25 October 2026

## Assessment

Evolve is a native Next.js application with two rooms, shared identity/theme and separate task/project/file views. No editable plugin manifest or plugin server belongs to this repository. The Plugin Creator workflow therefore does not call for a plugin-package update; application fixes use the existing Next.js/Vercel source and release process.

The verified scope is the application's tested user journeys, not a guarantee of zero defects. The balanced release evidence is in [EVOLVE_BALANCED_UPGRADE.md](EVOLVE_BALANCED_UPGRADE.md). Its complete browser sweep ran 266 cases; three failures were repaired and the final 36-case regression passed. The full sweep was not repeated after the focused repairs. Database/domain tests passed 228 cases. Real OAuth consent, production private-file CRUD, actual Blob restore, physical devices and screen readers are distinct from those local checks.

## Follow-up form investigation

A new browser reproduction confirmed that a pending progress-review note disappeared after saving a document checklist. The form was keyed by mutable project version; a checklist mutation increments that version, remounting the component and initializing its local note to an empty string. The repair keys the form to project identity. The regression also exercises a failed review request, retry, successful save and reload.

A separate failing browser test confirmed that failed stage changes closed the reason form and prevented retry. The form now closes only after a successful update and retains its explanation after a failed request. Independent review also found Operations evidence fields could be edited while their save was pending, allowing the response to overwrite newer text. A fieldset now disables evidence editing during saving; a network-gated browser regression covers the behavior. Final commands and release evidence will be appended after verification.

## Remaining risks and recommendations

| Priority | Finding                                                                                                | Practical improvement                                                                                                                                      | Boundary                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Health checks exist, but external alert delivery and production recovery objectives are not verified.  | Add redacted error/uptime alerts; rehearse database and private-file restoration in a separate environment, recording recovery time and data-loss windows. | Do not change production retention, connect a paid service or restore production automatically.                                                       |
| P2       | Import history is an admin-deletable journal; document files have no retained logical version history. | Add a distinct protected audit trail and document versions with clear retention and quota behavior.                                                        | Keep the 1 GB shared quota and private access unless the user chooses otherwise.                                                                      |
| P2       | CSV imports preview and merge safely, but no automatic batch undo exists.                              | Save bounded before/after snapshots and permit an admin to undo only when records have not changed since import.                                           | Never overwrite later edits, delete subsequent files or imply an old export is a complete backup.                                                     |
| P2       | A current upstream dependency advisory remains.                                                        | Track the vendor patch and verify upload/cancel/download flows before adopting it.                                                                         | Application Zod is 4.6.7; the affected bundled copy arrives through the Vercel chain. A package override alone does not rewrite compiled vendor code. |
| P2       | Browser testing primarily covers Chromium and emulated phone widths.                                   | Add Firefox/WebKit coverage and manual keyboard, screen-reader and physical-device review.                                                                 | Automated axe checks do not establish complete accessibility conformance.                                                                             |
| P3       | Board filters are useful but lack personal saved views and a configurable review interval.             | Add named Board views and a clearly explained review policy; retain the timeline-first layout and category split.                                          | Locker already has saved views; do not rebuild them or equate stages with physical progress.                                                          |
| P3       | Local task-scale smoke tests do not establish production concurrency or portfolio performance.         | Measure representative Board datasets, p95 API latency and large report generation before changing architecture.                                           | Preserve separate capacity units and the existing bounded query/export contracts.                                                                     |

## Dependency evidence

Fresh `npm audit --json` reports four high-severity package entries, all tracing to one advisory, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): oversized constrained collections can exhaust memory in Zod before 4.6.6. The chain is `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config` → bundled Zod. This is not a claim of four independent exploits or a confirmed remotely exploitable application path. The prior source review found limited use in CLI configuration parsing; the package advisory remains open.

Registry checks still report Blob 2.8.2 as latest. No automatic downgrade, SDK replacement or ineffective compiled-code override was applied. Existing private upload paths remain intact. The audit output is retained locally at `/tmp/evolve-final-security-audit.json`.

## Decisions presented to the user

1. Next focus: production alerts/recovery readiness (recommended), document versions/audit history, or safe CSV undo/report baselines.
2. Version retention within the current quota: admin-controlled retention (recommended), latest three versions, or external project links.
3. Stage reasons: require notes in both UI/API, retain old admin-client compatibility, or make notes optional.

Chosen: dashboard-first monitoring; recovery targets ≤24 hours data loss and ≤4 hours restore; strict reason enforcement in UI/API, including exceptional CSV workflow overrides. Future document versions must be retained until explicit admin removal within the existing quota. The earlier release's omitted-reason compatibility exception is superseded by this explicit user choice. Missing reasons now produce a validation error; no historical project records or earlier journal entries are rewritten.

The selected operational scope is implemented for verification. Document versions and batch undo remain recommendations; no billing, storage provider, account-role or production restoration change is included.

## Invitation flow audit

Access is an email allowlist, not a mailed invitation or expiring bearer link. Both rooms use the same People management and approval dialog. An administrator enters a normalized, validated Google email; optional workspace domain restrictions are enforced server-side. The dialog explicitly states that no invitation email is sent. Reapproving an existing address restores membership and updates its display name. It does not grant administrator status.

Google OAuth uses state and PKCE; new users must have a verified email and an active membership, except the configured administrator. Every authenticated request resolves membership from the database, with no cookie session-cache admission shortcut. Service commands also recheck active membership. Revocation deletes existing sessions, disables and clears Calendar credentials, and prevents new assignments to that member. The configured sole administrator cannot revoke their own membership. Domain restrictions apply to new approvals rather than retroactively revoking existing users.

Existing domain, database and browser cases cover verified/unverified identity, outsiders, admin-only approvals, domain limits, session removal, shared-room sign-out and protected routes. The full browser run also exercises Google OAuth initiation and the approval dialog. Actual Google consent and a real recipient's first login are not executed against production.

Useful next additions are a clearly labeled copyable onboarding message and sign-in instructions, followed by an admin access-review list distinguishing approved accounts from users who have signed in. An optional expiring invitation workflow would require a deliberate policy/schema change; sending mail would require explicit delivery authorization. No external invitation message was sent during this audit.

## Current verification — VERIFIED_LOCAL

The final full browser sweep passed **273/273 cases** in 14.6 minutes on the production build, including the invitation approval/OAuth initiation/access boundaries, both rooms, stage reasons, CSV overrides and all new Operations/draft regressions. This replaces the earlier partial browser-sweep limitation for the current source. Domain/database tests passed **237/237**. Type checking, linting, formatting of changed code and `git diff --check` passed. Template generation succeeded without changing the public 15-column template or examples.

The read-only header check passed at eight widths from 320px to 1440px. Operations browser checks include automated axe checks at 320px and 390px, optimistic conflicts, failed loads and retries, admin-only access, evidence persistence and disabled editing during saves. A final independent read-only code review reported no further actionable bugs or false invitation claims. These results do not guarantee absence of defects.

The enhanced isolated recovery drill passed: all **31 public fixture tables** matched by row count and deterministic content fingerprints after PostgreSQL dump/restore; the synthetic local file matched its checksum. Observed script duration was **949 ms**, for this small disposable fixture only. This is not the application's production RTO, a real Blob restore, provider-retention verification or proof of the RPO/RTO targets. No production session, user record or private file was fabricated or changed for testing.

Release evidence will be recorded after staged and live verification. Migration 0018 adds only the bounded Operations singleton; prior application builds can ignore it. Prefer forward repair if necessary because rolling back application code would restore its older stage-reason behavior.

## Production release — PRODUCTION_VERIFIED

Verified 25 October 2026 04:44 UTC at https://evolve-rensist.vercel.app/workspace/operations (configured administrator only). Application source `a8a7d078ea382a8a18798e10d5985b5b8ae1b2a5`; READY deployment `dpl_E5rneESsRJmVXUosgiowUC4KTqJX`; uploaded ordinary-build source digest `5036191c7cfeb9b160ebc11dc7c4b1b02d82ab2b81e04ad31976cfc358dacb88`. Additive migration `0018_operations.sql` was confirmed applied in the held migration build before the ordinary build was created.

Staged and live smoke each passed **24 health/access/origin/browser checks**, plus the exact 15-column CSV header comparison, without JavaScript errors. These production checks use anonymous access boundaries and the public demo; authenticated mutation and recovery tests use isolated local fixtures. The custom-domain mapping, source metadata and restored automatic-domain setting were independently checked. Temporary platform review access was revoked and its local file removed. The initial inline deployment request exceeded 10 MB and received an empty 401 response; excluding archived, unused `docs/mockups/**` assets allowed the reviewed application source to deploy. No runtime source was changed to resolve that upload issue.

Previous application deployment `dpl_ymH9xxgSC4N7NJuYNBhT6gdr1HnM` remains available as a release reference. Preserve the additive Operations table during any rollback. Dashboard alerts do not provide independent outage detection; provider retention and actual production/Blob restoration remain unverified. The upstream dependency advisory described above remains open.
