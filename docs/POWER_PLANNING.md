# Power planning workspace

This release replaces Overview with Dashboard, makes the product interface English-only, and adds project finance, saved views, per-task Calendar controls, and expanded management. User-entered content keeps its original language.

## Acceptance and behavior

- Dashboard reads full-database SQL aggregates, 7/30/90-day creation/completion trends, status distribution, workload, upcoming/past-due tasks, and project/currency summaries. Chart data is also available as a table. Drilldowns apply task filters to the server query and CSV export.
- Navigation preserves sections and task links in browser history. Legacy `section=overview` links open Dashboard. Shared clocks update independently of forms and honor the account time zone. Sidebar width, workspace font size, content width, accent, density, and reduced motion are saved settings.
- Task creation keeps drafts, optimistic versions, idempotent retries, templates, checklists, labels, recurring tasks, bulk editing, and CSV preview/import. New parent/dependency writes are rejected. Legacy relationships and tasks remain stored; relationships no longer block task completion.
- Projects record purpose, reference, system/location, owner, status, dates, IDR/USD currency, and budget. Administrators record actual costs and void/restore ledger entries with version checks. Decimal arithmetic and database sums preserve cents. Cost creation uses request receipts; a retry cannot duplicate a charge. A project's currency is locked after its first ledger entry, including a subsequently voided entry. Currencies are never combined through an assumed exchange rate.
- Saved filters/layouts are private to each account. Activity has server-side search, person/project/type/date filters, timezone-aware day boundaries, and keyset pagination. The admin-selected activity window limits the feed without deleting history.
- People management exposes access, open work, and administrator-only session/Calendar operational metadata. Administrator actions include profile edits, revocation/restoration, and ending another member's sessions. Only the configured verified owner is administrator.
- Workspace controls include invitation domains, task-edit pause for members, defaults, working days (shaded in Calendar), Calendar pause/resume, appearance, and activity window/page size. Every address still needs invitation; domain policy does not grant membership. Personal settings include notification preferences, time zone, theme, density, reduced motion, and activity scope.
- Task details show the current user's Calendar selection, connection, pending/error/synced state, last sync, retry/removal, and connection flow returning to that task. Explicit inclusion/exclusion overrides assigned/all scope. Done/archived/undated tasks are not scheduled. All-day and timed tasks use the selected reminder offsets. Account time-zone changes update the dedicated calendar through queued work. Calendar remains one way from Evolve. Explicit sync processes the selected account/task in the originating function before waking the durable queue; other mutations and daily recovery also process a bounded job before dispatch. Publishing and consuming both use Singapore.

## Persistence and release

Migrations `0006` and `0007` are additive. They add project fields, ledger entries, saved views, workspace configuration, Calendar selections/return links, and indexed activity context. They do not remove task relationships or rewrite organization data. The old application remains compatible with the additive schema for rollback.

The explicit `EVOLVE_CALENDAR_RECOVERY=1 npm run calendar:recover` operation drains up to five existing eligible jobs, prints counts only, and wakes the Singapore queue. It does not create fixture memberships or tasks.

Deploy with a controlled migration build, confirm the migration log, application health, and exact custom-domain alias target, then retain the prior READY deployment. Do not put test memberships, fixture sessions, or sample costs in Production. See [DEPLOYMENT.md](DEPLOYMENT.md) for the existing Vercel/Neon runbook.

## Verification boundaries

Automated tests use real disposable PostgreSQL databases and isolated browser sessions. Google transport tests deliberately mock the provider to verify account binding, PKCE/state, explicit selection/removal, reminders, timezone updates, pause/retry, and stable event identities. The owner reported that Calendar API is enabled and their account connected. Actual Google event receipt and device notifications require that real account; mocked tests do not establish delivery.

Production acceptance and final test/CI results are recorded in the release PR. Historical release notes remain historical evidence, rather than descriptions of the current interface.
