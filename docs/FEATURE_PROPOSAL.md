# Evolve — approved scope and implementation contract

Updated 16 October 2026. The owner selected bulk editing plus CSV import; subtasks, dependencies, templates and recurrence; and one-way Evolve → Google Calendar with Calendar reminders. These choices are implemented in the release candidate. Production release and external provider verification are tracked in [RELEASE.md](RELEASE.md).

## Approved features

| Area                                | Implemented behavior                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Personal profiles                   | Members edit their own display name, job title, bio, private avatar, time zone, and account preferences. Google email remains the login identity.                                                                                                                              |
| Workspace and member administration | Only `ADMIN_EMAIL` edits workspace name, description, logo, accent and time zone, member display names/jobs, or membership access. Versions prevent stale profile/workspace edits. No second administrator is introduced.                                                      |
| Interaction                         | Writing-focused task composer, recoverable tab drafts, explicit unsaved-edit handling, sticky actions, task detail drawer on desktop, responsive settings tabs, theme/density/sidebar preferences, keyboard shortcuts and task deep links.                                     |
| Notifications                       | Recipient-scoped persistent assignment/comment notifications, individual/all-read actions, and PostgreSQL LISTEN/NOTIFY invalidation over authenticated SSE. Reconnects check the durable workspace revision. A visibility refresh and periodic refresh recover missed events. |
| Documents                           | Private task/project attachments; image/PDF preview, Office/text download, progress/error feedback, owner/admin deletion. Private avatars and workspace logos use the same authorized file service.                                                                            |
| Google Calendar                     | Separate optional OAuth consent per member, a dedicated Evolve secondary calendar, assigned/all active task scope, stable event IDs, encrypted tokens, versioned settings, disconnect and retry. Existing personal calendars are not synchronized.                             |
| Calendar reminders                  | Timed tasks send configured `popup` reminders (up to five, 0–40320 minutes). All-day events use calendar defaults. Task deadline zones preserve the intended instant across reassignment. Google Calendar and device notification permission remain necessary.                 |
| High-volume work                    | Database-wide search/filter/sort/counts, chronological keyset pagination, overview/project/member aggregates, direct task lookup, and streamed snapshot-consistent CSV export.                                                                                                 |
| Bulk and import                     | Up to 100 tasks per atomic batch/import, optimistic versions, stable request receipts, CSV preview and row errors. Invalid imports do not partially commit.                                                                                                                    |
| Planning                            | Independent subtasks, parent and explicit dependency graph validation, completion blockers, templates, daily/weekly/monthly successors created once on completion. Monthly schedules retain their original day across short months.                                            |

Recurrence copies ordinary task fields and resets checklist items. It does not copy subtask/dependency graphs. A disabled previous assignee becomes unassigned on the next occurrence. Date-only recurrence remains date based; ambiguous DST hours choose their first occurrence, and nonexistent local deadline times are rejected.

## Access boundaries

Members see shared organization tasks/projects and public member profiles. Notification preferences, Calendar tokens and settings belong to the current account. Active membership is checked on requests and again inside protected mutations. Revocation deletes sessions, disables Calendar sync and wipes its tokens. Data previously downloaded or copied to Google cannot be recalled.

Files accept PDF, DOCX, XLSX, PPTX, TXT, PNG, JPEG and WebP; no executable, HTML, SVG or macro-enabled Office files. Limits are 25 MB/document, 2 MB/avatar/logo and 1 GB/workspace. These are application limits, not a promise that provider operation/transfer quotas are unlimited. Signature/size validation is not malware scanning. Abandoned uploads, failed deletions and unused old profile images are cleaned during subsequent uploads and daily maintenance.

## Transport and provider decisions

Realtime uses SSE with one shared direct PostgreSQL listener per function process and revision-based reconnect recovery. It does not require Ably or expose PostgreSQL credentials to the browser. This is one-way invalidation, without collaborative text editing or presence.

Calendar changes are transactionally queued in PostgreSQL. Vercel Queues dispatches workers even without an open browser; leases, generations, deterministic event IDs and durable retries handle duplicate deliveries and concurrent edits. Daily authenticated maintenance recovers missed queue dispatches. Calendar scope is `calendar.app.created`, requested separately from login.

Vercel Blob private storage is provisioned in Singapore on the existing Hobby account. No paid plan was activated. Google Calendar API, OAuth callbacks/audience and actual account consent require owner-side Google configuration: see [the step-by-step guide](GOOGLE_CALENDAR_SETUP.md).

## Outside this delivery

Multiple organizations, private projects, custom roles, a second administrator, two-way Calendar sync, browser push, email delivery, AI features, Gantt, time tracking, OCR, file versioning and malware scanning have not been added. Extra product features and paid services require a separate choice.

## Acceptance and evidence

[RELEASE.md](RELEASE.md) distinguishes local PostgreSQL/browser tests, mocked Google worker tests, live Blob verification, hosted preview status and outstanding real Google/device checks. Tests do not fabricate a successful live Google authorization exchange.

Primary references checked 16 October 2026: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Google events/reminders](https://developers.google.com/workspace/calendar/api/v3/reference/events), [private Blob](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Blob usage](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Vercel Queues](https://vercel.com/docs/queues).
