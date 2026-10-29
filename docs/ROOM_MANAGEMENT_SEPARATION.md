# Native room management and readable charts — 24 October 2026

## Delivered behavior

- Removed the workspace identity card (the Rensist section) from both room sidebars. Room switching, search, feature navigation, account utilities and Home remain available.
- Board Room’s People, Activity, Files, Templates and Settings open inside `/board-room`. Locker Room’s management destinations remain inside `/app`. Home intentionally opens the shared app chooser.
- Both file managers use the same component and retain search, location/status filters, sorting, pagination, selection, bulk deletion, confirmation, download progress/cancellation/retry and cleanup retry. Board inventory contains Board project documents; Locker inventory contains its tasks, drafts, projects and the common account/workspace images. Shared account images remain part of the common identity system; they are not duplicated into both file inventories.
- The server scopes inventory rows and per-room usage by attachment ownership. A deletion containing another room’s file is rejected atomically before any file is marked. The provider and physical **1 GB** allowance remain shared; each manager distinguishes its own usage from the shared allocation. Recent removed files remain listed as Removing until the existing cleanup hold expires, and cannot be downloaded.
- Board’s journal reads Board project history, with search, person/project/type/scope/date filters, cursor pagination, project details, administrator single/bulk selection and deletion. Deleting Board journal rows cannot delete Locker activity. People and invitations reuse the existing membership controls because authentication and invited access remain common.
- Native Board templates provide the real project CSV/example downloads, project database, stage configuration and categories. The local Locker template page exposes existing task templates and the task workspace. These adapt the existing available features to each app’s domain; no task record is created by Board project actions.
- Account settings use the matching room’s file manager and export. Board exports project CSV, Locker exports tasks. Profile/appearance/access stay shared. Sidebar preference updates synchronize newer versions into open Board settings, preserving unsaved fields and avoiding stale saves. Successful file removal refreshes the parent snapshot, including project validity and counts.
- Chart labels/counts use a readable hierarchy: 14 px labels, 12 px supporting text, 24 px stage counts and consistent 17 px chart headings. Tiny schedule/helper text was raised, long stage names wrap, category counts align, and the tablet schedule uses seven columns rather than squeezing fourteen. Desktop/phone layouts preserve contained scrolling for dense data.

## Verification

The full domain/integration suite passed **203 tests**. New integration cases prove room inventory isolation, mixed-room deletion rollback, unchanged shared allocation, review invalidation, Board-only management data/journal filtering, cursor traversal/filter binding and admin-only deletion. TypeScript and zero-warning ESLint are checked before release.

Browser regressions cover local management navigation, desktop/mobile sidebar behavior, private downloads/deletions, bulk actions, validity readback after switching sections, second-page Board journal loading without Locker requests, settings saves after sidebar preference updates, members’ restrictions, project export and shared sign-out. Both chart compositions and file settings are inspected at desktop and phone widths, with no page overflow and WCAG AA scans. Existing Board project/import/document workflows and shared room-switching/settings/access workflows also passed.

Independent read-only review caught three issues during development: the old load-more endpoint, stale parent validity after removal and open-settings profile version drift. All were fixed and exercised by regressions. A new file test initially expected immediate disappearance, although the existing cleanup model correctly retained Removing rows; its assertion now verifies Removing state and a 404 for content. No assertions were disabled.

All authenticated tests and screenshots use disposable synthetic local fixtures. No production sessions or user data were manufactured. Live private-file CRUD and a new owner Google authorization-code exchange are not established by the local tests. No migration, paid resource, storage-provider/quota change or access expansion is included. The upstream Vercel dependency advisory documented in [the previous audit](CROSS_APP_DESIGN_AUDIT.md#upstream-dependency-advisory) remains unchanged.

## Screenshots

- [Board files, desktop](screenshots/board-files-desktop.png)
- [Board files, phone](screenshots/board-files-phone.png)
- [Board charts](screenshots/board-chart-type.png)
- [Locker charts](screenshots/locker-chart-type.png)

## Final check results

- `npm test`: **203 passed**, zero failures.
- TypeScript/route generation and zero-warning ESLint: passed.
- Board/shared-app regression: **23 passed**.
- Sidebar/design/file audit: 19 of 20 passed initially; the file-removal assertion was corrected for the documented cleanup hold and passed in later runs.
- Later sidebar/design/management run: 16 of 17 passed; the new export assertion was corrected to parse valid quoted CSV headers.
- Final production-build management run after all UI fixes: **8 passed**, zero failures, including parsed project export and real shared sign-out. No assertions were disabled.
- Independent review: all three important findings repaired; no remaining important issue in the reviewed deltas.

The screenshots above were regenerated by the final browser run from synthetic fixtures. Publication evidence follows after staged/live checks.

## Verified publication

Published at https://evolve-rensist.vercel.app/board-room, verified 24 October 2026 12:41 (UTC+7). Source `fd45d39aca45f187a38a894d8f0adea795f1263a`; READY deployment `dpl_31VDrR7SXxNanNqKLvhj77SVJkgJ`; uploaded digest `e5bef9d2f0264689d0871b975961dd69b7d27d1c51e266e8f6e9392ae2c0fd50` matched deployment metadata. The production custom-domain alias points to this exact deployment.

Staged and live verification passed health/current schema, private API login boundaries, origin rejection, both room file scopes, Board management/activity endpoints, desktop/mobile demo rendering without page overflow or JavaScript errors, absence of the sidebar workspace card, and all 14 CSV headers. One immediate live request returned 404 during domain propagation; the subsequent strict live run passed every check. Private authenticated workflows were exercised against disposable local databases, as described above.

Temporary deployment review access was revoked and automatic domain assignment restored to its previous value. Previous deployment `dpl_Hp4eQKBBVkvrR39MtZ9185hRVnW1` remains the rollback reference. No migration or storage/quota change was required.
