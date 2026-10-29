# Shared storage and project documents

Approved plan: shared Settings → Files shows one pool with Locker, Board and shared-assets usage; each project offers optional documents using existing private uploads. No schema/provider/permission changes.

Base: 2f9b4da. Work: existing non-main work checkout. Applying executing-plans and TDD; cloud skill scripts have no local installation, so this ledger records equivalent progress.

Pre-flight: file inventory produces usage consumed by FileManager in shared and room settings; project upload components share existing transfer endpoints. Preserve legacy roomBytes/roomCount (Locker historically includes shared assets), while new buckets classify those separately. Ruling: retain legacy list ownership of shared assets in Locker to preserve deletion boundaries; label that explicitly in shared Settings.

Tasks: (1) aggregate usage and regression tests, (2) shared summary and Documents discoverability, (3) verification, fresh review and held release. Dependency advisory remains open; the prior security override applied only to the previous release. Do not infer a new override.

Task 1 complete: aggregate regression RED (missing breakdown) → GREEN; complete node suite 254/254 passed, including cross-app concurrent quota enforcement. Task 2: shared summary/cards and optional project documents; existing 23 targeted browser cases passed. Added real Locker project upload/persistence/download/deletion coverage. Post-create handoff regression failed before implementation, then passed visibility check.

Final reviewer found Important keyboard focus overwrite and Minor indefinite loading on inventory failure. Regraded failed-reading loading as Important because plan explicitly requires recovery state. Both have failing browser regressions before fixes. No other findings. Ruling: test deletion should check the attachment row, not the completed download panel retaining the filename; corrected assertion without product changes.

Final acceptance: 254/254 domain/database tests and 25/25 focused production-build Chromium cases passed. The browser suite covers shared/app summaries, 320/390/1440 layouts and automated accessibility, project handoff with settled focus, real private Locker document upload/reload/download/deletion, Board uploads/review/CSV/permissions, transfer cancellation/retry and draft guards. Both final review findings passed RED→GREEN; no deferred findings. Desktop and phone screenshots were visually inspected and saved under docs/screenshots/shared-storage-{1440,390}.png using synthetic local records. No real production documents were created.

Type check, lint, full-repository formatting and diff-whitespace checks are required before candidate upload. Security recheck still reports four high package entries and zero critical for the known advisory. Preparing a held build is authorized; promotion remains held by the existing security policy pending a new release decision.

## Held release verification

Type checking, lint, full formatting and diff-whitespace checks passed. Application source `6fc25f91c3a78b1721fcefd468adfdcd50f14e55`; READY candidate `dpl_EMDAibgfmjhsQLWqsL1Mc85mFDHx`; source digest `a1e3e1439bed5fc7c2836fc86d9febaa1f7a076e4ce7931402fdcaeeb426ea1d`. Held candidate: https://evolve-rnpansumm-jarjirjor777-5316.vercel.app. No migration required. All 28 anonymous health/access/origin/browser smoke checks and exact 15-column CSV header check passed without browser errors. Authenticated feature tests used disposable local fixtures; no production project uploads were performed. Temporary platform review access was revoked and its local file deleted.

Release incident: automatic domain assignment was restored before the candidate finished, allowing Vercel to assign it to the production domain at completion. This was detected by the source/alias guard before smoke testing. The previous deployment was promoted back; an immediate alias read was stale, while subsequent independent reads confirmed restoration. A subsequent full 28-check canonical-domain smoke run passed. Production now maps to `dpl_2xvyaoUfSeaSQEDuvi3XhGiesZ9B`. Automatic-domain settings are restored. Future held workflows must keep automatic assignment disabled until the candidate is READY and the alias has been verified; restoring it immediately after creation is insufficient. No database or attachment migration occurred.

Historical checkpoint: **IMPLEMENTED_AND_VERIFIED; NEW_RELEASE_HELD_FOR_SECURITY_DECISION**. The earlier exception covered only the ABC release. The audit still has four high package entries for GHSA-mrhx-c7xc-m3w5 and zero critical; dependencies and the blocking CI audit command remain unchanged. Current source and review fixes are preserved on `work`. No merge, push or PR was requested. Sanitized evidence: [release record](audit-data/shared-storage-release-2026-10-25.json).

## Published production release

Status: **PRODUCTION_VERIFIED_WITH_KNOWN_ADVISORY**. The user explicitly selected “A and Publish to production.”, authorizing a one-release exception after disclosure of the four high dependency entries. The exact held production build `dpl_EMDAibgfmjhsQLWqsL1Mc85mFDHx` was promoted without rebuilding. Source `6fc25f91c3a78b1721fcefd468adfdcd50f14e55` and digest `a1e3e1439bed5fc7c2836fc86d9febaa1f7a076e4ce7931402fdcaeeb426ea1d` were verified against both deployment metadata and reconstructed committed upload content before promotion.

Verified at 2026-10-25T21:57:14.570381+00:00: canonical domain https://evolve-rensist.vercel.app maps to the READY candidate; all 28 live health/access/origin/browser checks and the public CSV template check passed without JavaScript errors. Production settings are restored and temporary platform review access remains revoked. No migration or synthetic production upload was needed. The previous application release remains the rollback reference. The dependency advisory remains open; the blocking CI audit command and dependencies were not changed.
