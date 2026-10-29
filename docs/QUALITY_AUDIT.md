# Evolve product and quality audit

Reviewed 16 October 2026 with the Full-Stack Developer workflow. The original site was a functional first release, but task creation, large-workspace behavior and release discipline did not match the requested product quality. The criticism of the original creation form was supported by browser inspection and source review. There is no invented numeric quality score or claim of bug-free software.

## Findings addressed

| Finding                                                           | Resulting behavior                                                                                                                                     | Evidence                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Dense creation form, small controls, poor draft/error recovery    | Dedicated writing area, larger title/control sizes, separate properties, sticky actions, draft recovery, keyboard save, explicit unsaved-edit decision | Desktop/tablet/mobile browser flows, failed-save retry, keyboard/focus and accessibility checks               |
| Flat checklist structure and repeated manual entry                | Independent subtasks, dependencies, cycle/completion checks, templates, daily/weekly/monthly successors                                                | Real PostgreSQL atomicity/graph/recurrence tests and browser planning flow                                    |
| Search, reports and export limited by loaded pages                | SQL-wide filters/counts, chronological keyset pagination, aggregate reports, direct lookup and snapshot CSV export                                     | More than 500-row query tests, 1,000-task browser scenario, concurrent export snapshot test                   |
| Repetitive one-task operations                                    | Atomic bulk editing and previewed CSV import, with row errors, version conflicts and idempotent retry                                                  | Browser import/bulk readback; real database rollback and duplicate prevention                                 |
| Minimal account/workspace customization                           | Own profile/avatar/time zone/preferences; admin-only workspace identity/logo and member names/jobs                                                     | Browser reload, role rejection, stale versions and private image upload tests                                 |
| Poll-only notifications and unloaded-task links                   | Commit-triggered SSE invalidation, durable revision recovery, individual read state, remote task lookup                                                | Two-browser inbox delivery and task opening; PostgreSQL LISTEN test                                           |
| No document context                                               | Private task/project documents, preview/download/delete, private profile images                                                                        | UI/API lifecycle tests, role/anonymous/revocation checks and live private Blob verification                   |
| No personal Calendar integration                                  | Separate per-account OAuth, assigned/all scope, dedicated calendar, durable sync jobs and reminders                                                    | OAuth/worker simulations, PKCE/cookie/forged-callback browser checks; real Google consent remains outstanding |
| Save could appear stale after pagination changes                  | Query and refresh generations plus immediate merging of returned rows                                                                                  | Browser test deliberately holds an older refresh across a successful save                                     |
| Narrow planning control on mobile; low-contrast dark selected tab | Full-width recurrence/time controls and a separate readable accent text color                                                                          | Render inspection and axe checks of updated desktop/mobile/dark states                                        |

## Scope and practical limits

The audit inspects all primary navigation sections and the task, project, membership, profile, attachment, notification, search and integration paths. Tests use real PostgreSQL and signed fixture sessions only in disposable test databases. Google worker tests replace the external transport deliberately; they do not establish a real Google authorization exchange or a device notification.

Measured local results, exact commands, test totals and hosted deployment state are maintained in [RELEASE.md](RELEASE.md). Local timings are single-machine production-build observations, not public-network benchmarks, field Core Web Vitals or a load-test SLA.

The product remains one shared organization per deployment. Inbox/activity are bounded to 100 recent records, discussions to the latest 500 comments. There are no private projects, custom roles, two-way Calendar sync, Gantt, time tracking, mobile native apps, browser push, email delivery or AI functions. These have not been represented as working premium features. More functionality requires a separate user choice.

Remaining operational checks include actual owner/teammate Google sign-in, real Calendar consent/event/reminder delivery, provider recovery/retention, production alerting, public load testing, Safari/Firefox/device coverage and assistive-technology testing. Automated accessibility results apply to tested states, without claiming WCAG certification. File signature checking is not malware scanning.

## Visual evidence

Original task creation: [desktop](screenshots/audit-before/task-create-desktop.png), [mobile](screenshots/audit-before/task-create-mobile.png).

Replacement composer: [desktop](screenshots/audit-after/task-create-desktop.png), [mobile](screenshots/audit-after/task-create-mobile.png), [filled form](screenshots/audit-after/task-create-filled.png).

Current settings and planning: [desktop settings](screenshots/features/settings-1440.png), [mobile settings](screenshots/features/settings-390.png), [desktop planning](screenshots/features/task-planning-1440.png), [mobile planning](screenshots/features/task-planning-390.png). Browser screenshots show synthetic fixtures, not customer data.

The app uses one modular Next.js/React/Drizzle codebase and managed primitives appropriate to a small organization. Native Vercel WebSocket support is available in public beta, but SSE suits this delivery's one-way invalidations. Adding an unrelated realtime vendor would not improve the required flow by itself.

## Interface language and archive follow-up

The follow-up audit reproduced missing archived results in global quick find and corrected archive discoverability, responsive typography/form grouping, and English/Bahasa Indonesia support. See [the correction evidence](UI_LANGUAGE_ARCHIVE.md) for behavior, tests, screenshots, deployment status, and remaining verification limits.
