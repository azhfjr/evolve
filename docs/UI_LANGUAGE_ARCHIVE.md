# Interface, language, and archive correction

This update addresses task capture readability, inconsistent interface languages, and archived work that was difficult to find. The application remains a shared, invite-only workspace with the existing sole administrator.

## Findings and corrections

| Finding                                                                             | Resulting behavior                                                                                                                                                                                                    | Verification                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global quick find excluded archived tasks, so an archived item appeared missing.    | Quick find includes active and archived work by default, offers explicit scope selection, and marks archived results.                                                                                                 | The original browser reproduction failed before the fix; the same search/open/restore path now passes. SQL checks include an archived task beyond the initial 500 records. |
| Archive navigation was below projects and could be obscured on shorter screens.     | Archive sits beside the task views, has a database-wide count, and explains how to recover work.                                                                                                                      | Desktop/mobile navigation, preserved context, reload, direct restore, detail restore, and Undo.                                                                            |
| The archive reused active-task empty actions and calendar bounds.                   | Archive uses a dedicated list and empty explanation. Search and filters remain available; restore buttons are visible in each row.                                                                                    | Browser archive checks and shared server query coverage.                                                                                                                   |
| The interface mixed English and Indonesian, including errors and activity text.     | English/Bahasa Indonesia is selectable at sign-in, in the workspace header, and in account settings. The account preference persists across reloads and devices; signed-out/demo choices use browser storage/cookies. | Catalog interpolation, date/number/validation/event tests; browser language persistence, unsaved profile form, and unchanged draft content.                                |
| The initial task window could briefly appear before the database query completed.   | Task routes wait for their matching query result, keep database-wide totals stable during pagination, and offer a retry action after a failed query.                                                                  | Delayed/failed query browser test and a 1,000-task pagination/search/export scenario.                                                                                      |
| Small responsive text, wide task rows, and broad label styles caused cramped forms. | Shared type/control rules, vertical field groups, flexible headers, wrapping task names, mobile task rows, persistent form actions, and readable properties/planning/template controls.                               | Production-build Chromium checks at 1440, 768, 390, 360, and 320 CSS pixels; automated axe checks in the tested states.                                                    |

User-written task titles, descriptions, comments, project names, labels, and filenames are preserved. Activity verbs are translated at presentation time; stored activity remains compatible with the existing data. ISO dates, status values, CSV columns, time zone identifiers, and API command names remain stable. Native date/time picker presentation follows the browser/device locale.

The locale is stored in the existing JSON account preferences. A dedicated locale command does not increment the profile edit version, and profile saves preserve the latest stored locale, so switching languages does not invalidate or overwrite an open profile edit. No schema migration is required for this update.

## Evidence

Release checks are `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, and the production dependency audit. The [Quality workflow](https://github.com/azhfjr/evolve/actions/workflows/quality.yml) retains the latest complete run and browser artifacts. The associated pull request records the final deployment identifier and live verification results.

The unit/integration run for this correction passed 59 tests, including the new account-locale and archived-search cases. Preview deployment `dpl_GxshpaX8k2jjD3zitWGfj4JCCPDk` built successfully; its Vercel protection remains enabled, so build readiness is distinct from public functional verification. Test sessions and data are restricted to disposable databases; public live checks use the isolated browser demo.

Screenshots use synthetic demo data:

- [Indonesian task editor, desktop](screenshots/localization/task-id-1440.png)
- [Indonesian task editor, tablet](screenshots/localization/task-id-768.png)
- [Indonesian task editor, mobile](screenshots/localization/task-id-360.png)
- [Indonesian archive, narrow mobile](screenshots/localization/archive-id-320.png)

## Verification limits

Automated Chromium/axe checks do not establish complete accessibility certification or Safari/Firefox/physical device compatibility. Real Google sign-in authorization and optional Calendar consent/device reminders still require an actual owner or invited teammate session; fixture sessions and mocked Google transport do not prove those external flows. The [Indonesian Calendar setup tutorial](GOOGLE_CALENDAR_SETUP.md) covers the remaining owner-side configuration and connection steps.

Rollback uses the preceding READY Vercel deployment; this release does not alter the database schema.
