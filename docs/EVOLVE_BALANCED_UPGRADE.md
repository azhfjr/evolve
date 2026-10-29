# Evolve balanced upgrade — 24 October 2026

## Product behavior

Home now opens with live attention counts and filtered links for the current person's open work, overdue/today tasks, document reviews, missing files and incomplete Board records. Counts use the account timezone and remain additive to the two room entries. Locker's daily work summary precedes the connection map.

Board projects support a responsible contact, required-document checklist, a separate progress review with note/person/time, and a document review note. Project stage/year changes invalidate the progress review; unrelated metadata/file edits do not manufacture a fresh progress review. New and legacy records without a review are review-due while incomplete. Completed projects are not labelled reviewed without a real review. Attention filters select incomplete, unassigned or stale-review records across all result pages. Missing metadata warnings are guidance; they do not prohibit partial project registration.

Admins supply a reason in the interface for jumps and reversals. Existing API clients omitting the optional reason remain compatible and their history explicitly records that no reason was supplied. Explicit empty reasons on exceptional changes are rejected. This is a compatibility choice, not a claim that reasons are enforced on every historical client. Members remain read-only. A current stage of 5/10 describes workflow position, not 50% physical progress.

Required document checks reflect admin review against uploaded files. A specified incomplete checklist prevents marking Valid; changing requirements/checks clears validity. File changes continue to invalidate document validity. Document validity and progress review are separate decisions.

Each project's connected-project panel finds RUPTL Codes in the other room (Board external code; Locker project reference), ignoring case and surrounding whitespace. All matching records are offered; duplicates are never silently merged. Links neither create nor synchronize records. No matching code/record has a useful empty state, and failed requests can be retried.

Database includes a personal named column mapping saved to this account/browser and the latest 25 import batches with actor, time and counts. All-unchanged imports are recorded. This is the existing deletable journal, not a protected compliance audit or automatic rollback facility. Canonical CSV remains 15 columns; review metadata and requirements are app-managed and preserved during ordinary imports.

Reports open a dated, filtered meeting report across all matching result pages (up to 5,000), ready for browser Print/PDF. It includes individual capacities with units, stage names, human validity, responsibility and progress-review evidence. The rendered report is a point-in-time response that can be saved as PDF; no server historical baseline is implied. HTML is escaped and served privately without scripts or third-party resources.

Shared file allocation now warns at 80%, becomes critical at 95%, and indicates full at 100%. The 1 GB app allocation remains shared physically while room inventories stay independent. Deleting recent files still reserves allocation through the existing cleanup hold. Vercel Blob remains the provider.

## Verification ledger

- `npm test`: 228 domain/integration tests passed, zero failures (`/tmp/balanced-node-final.log`).
- `npm run typecheck` and zero-warning ESLint passed (`/tmp/balanced-types-final.log`, `/tmp/balanced-lint-release.log`); production builds completed for the browser runners.
- Complete 266-case browser sweep: 263 passed, three findings (`/tmp/balanced-browser-full.log`). Two were ambiguous test locators/count assertions; one was a real phone overflow in the management-page header. All were corrected. The rebuilt final regression run exercised 36 relevant cases with 36 passes, zero failures/skips (`/tmp/balanced-browser-final-regression.log`), including all three original failures, both sidebars, settings, document reviews, imports, reports and cross-room links. The complete sweep was not repeated after these focused repairs.
- Six desktop/phone views of Home, Board and Locker had no JavaScript errors, no page overflow and no automated WCAG A/AA violations (`.vercel/balanced-local-visual.json`). Synthetic screenshots are `docs/screenshots/balanced-*`. The final management-page regression also checks phone overflow and accessibility after the header fix.
- Independent review identified CSV year changes retaining stale review metadata: regression tests reproduced this, then passed after correcting both start-year and COD-year invalidation. The other review finding was the deliberate legacy-client reason exception documented above; it remains a compatibility choice, with UI reasons required.
- Browser regressions also exposed and fixed duplicate sibling React keys producing repeated cross-room panels, and checklist controls snapping back during saves. Both original journeys passed in the rebuilt final run.
- Local PostgreSQL recovery and synthetic file checksum passed. Neither real Blob recovery nor a provider retention guarantee was tested.

All private workflow fixtures used disposable local databases and synthetic sessions. No production user session was manufactured, and no fresh owner Google/Calendar delivery or private production file CRUD is claimed. Deployment evidence is recorded below after staged and live smoke checks.

## Operational boundaries and follow-on work

This release does not change providers, quotas, roles, paid plans, external notifications, or production backup configuration. Required-document versions/trash, protected immutable audit storage, reversible CSV batches, saved server baselines, automatic review requests/digests and physical device/screen-reader acceptance remain follow-on work. These require explicit retention/ownership rules or separate integration work; they are not represented as functioning controls in this build.

The known upstream Vercel CLI-bundled Zod advisory remains documented in CROSS_APP_DESIGN_AUDIT.md. Application Zod is already patched; no unreviewed package downgrade is included.

## Recovery exercise

Run `npx tsx scripts/verify-local-recovery.ts` with the known local PostgreSQL container running. The script verifies a local-only binding, dumps only the disposable `evolve_e2e` fixture database, restores into a newly generated database, compares table counts, tests a synthetic local-file backup/checksum, and removes its own temporary artifacts. It never reads production configuration or Blob tokens.

The first drill reproduced a real failure: pg_dump's empty search path prevented existing CHECK helper bodies from resolving sibling `public` functions during COPY. The verified local procedure renders the trusted dump to SQL and sets `pg_catalog, public` for restore. Do not remove that explicit search path without validating a helper-function hardening change. Review any production restore with the database provider and a separate recovery environment; this local exercise does not establish Neon retention, actual Blob restoration or a production recovery-time guarantee.

A previous deployment is a reference, not a universal rollback target. Older writers do not preserve every new JSON review field. Prefer a forward fix after new data is written, retain the database, and never restore or reverse migrations automatically.

## Production release

Live at https://evolve-rensist.vercel.app/workspace; verified 24 October 2026 21:16 (UTC+7). READY deployment `dpl_ymH9xxgSC4N7NJuYNBhT6gdr1HnM`, application source `f0984e452380536ccf6745df9b43b0ddaf856bc8`, uploaded source digest `167ad6464c93f7bd5aede03ebed2599f1894efb4a5b0abf758b1298ce0c11492`. The live custom-domain mapping, exact source metadata and restored automatic-domain setting were independently checked.

Staged and final live smoke each passed 21 health/access/origin/browser checks, plus exact 15-column CSV header comparison, without JavaScript errors. The first immediate live request reached an older route during alias propagation and returned 404; the subsequent strict full live run passed. Temporary platform review access was revoked and its local access file removed. No schema migration, provider/quota change, new paid resource or production fixture/session was introduced.

Previous deployment `dpl_4F9FmapooegrdQDB9VYnfkUhJdXe` remains the prior release reference; apply the JSON compatibility/forward-repair caution above.

## Subsequent policy change

The 25 October Operations/policy follow-up supersedes the legacy omitted-reason exception described above. See [current audit](EVOLVE_FINAL_AUDIT.md) and [Operations runbook](EVOLVE_OPERATIONS_READINESS.md) for current scope, verification and recovery limits. Historical release evidence above is unchanged.
