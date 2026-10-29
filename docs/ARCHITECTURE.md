# Architecture and permissions

Evolve is one invite-only organization per deployment. The only administrator is the verified Google email configured in `ADMIN_EMAIL` (`jarjirjor777@gmail.com`). Every active member can read shared tasks/projects and contribute tasks, discussions and files. Admin alone manages workspace branding, projects and membership. Members edit only their own account; admin can edit member display names and jobs. No client-provided role is trusted.

## Authentication and writes

Next.js server pages and every private API resolve Better Auth's database-backed Google session and current membership. Password/email registration and session cookie caching are disabled. Revocation removes sessions and disables/clears Calendar credentials. HTTP-only cookies use SameSite Lax and Secure over HTTPS. Mutations require the configured origin, bounded request bodies and strict Zod validation.

The modular service executes commands in PostgreSQL transactions under a workspace advisory lock. It rechecks active membership, writes tasks, audit records, notifications and Calendar jobs atomically, advances a durable workspace revision, and emits `pg_notify` only when the transaction commits. Optimistic versions reject stale edits. Request receipts bind idempotency keys to the actor and canonical validated payload. Writes are limited to 120 commands/account/minute; batch/import commands contain at most 100 tasks.

New tasks are independent. Legacy dependency links and parent data remain in the database for compatibility but no longer constrain editing or completion; the application rejects new relationship writes. Completing a recurring task creates one unique successor; reopening and completing again cannot create another. Monthly anchor days survive shorter months. Timed deadlines persist an IANA zone, so assignment changes do not reinterpret time. DST gaps are rejected, and repeated local hours use the earlier instant.

Project labels are the sole active label source. Tasks inherit the current Project labels on every read and have none in No project; stored legacy task labels remain intact. Project tags use canonical lowercase bodies and display as hashtags. Task inputs cannot define independent labels. Receipt replays return current task/project records rather than historical field snapshots; their stored receipt remains unchanged. See [the label and immersive-map review](PROJECT_LABELS_IMMERSIVE_REVIEW.md). Connection filters globally before pagination and returns contextual parent Projects separately from matching results. The canvas renders Label → Project → its own Task edges, deterministic hierarchical positions and an animation-frame camera; Fit resets both layout and camera. Native fullscreen uses the same persistent camera, and dense overview zoom retains the List/toolbar navigation path.

Project categories and optional Planned COD (integer year 2026–2040) use nullable additive columns. Omitted COD updates preserve the stored value; explicit null clears it, and existing projects remain unset. Option management lives after Description and controls the matching Cost groups. The Projects portfolio offers Cards and an expandable Checklist with per-option totals. Options are independent: amounts are never combined into a project total or compared with project expenses to calculate Remaining. Expenses keep separate project-level currency totals.

The authoritative grouped values live in cost_options. New grouped writes set obsolete compatibility cost_items to [] and budget to 0.00 after receipt hashing/lookup; legacy-only commands keep their original single-group conversion. Migration 0015 does not rewrite existing rows, so old projections stay intact until the next explicit grouped save. Omitted options and label-only writes preserve groups. A changed legacy projection is still rejected when it could erase grouped data. Historical payloads/fingerprints are retained for unchanged lost-response retries.

Amounts stay strings through API/DTO/storage and use BigInt minor-unit arithmetic, with two monetary or six rate decimal places. Grouping is linear string formatting, with no JavaScript Number conversion. Unconstrained PostgreSQL numeric replaces numeric(14,2); persisted inputs respect the technical 131,072-whole-digit limit and streamed 2 MB command limit. Derived option totals can carry into additional digits. Drafts have separate bounded resource limits and report storage failures rather than silently claiming recovery. Task list/board project references wrap complete names, including long unbroken text, with explicit mobile metadata areas. See [the current revision contract](TASK_COST_PRECISION_REVIEW.md).

## Queries and realtime

Initial workspace data retains bounded 500-row pagination for compatibility. Task views query SQL filters, global counts and keyset pages (200 by default in the UI), rather than restricting search/reporting to loaded rows. Dashboard, project and member aggregates cover the whole database. Direct lookup opens tasks outside loaded pages. CSV export streams a repeatable-read snapshot with backpressure, time bounds and current-membership checks between pages.

Authenticated SSE streams carry revision invalidations only. One direct PostgreSQL LISTEN connection per function process fans out commit notifications to subscribers. Connections renew below the Vercel function duration. A reconnect compares the durable revision; failed listeners use short polling, and the browser also refreshes on visibility return and periodically. Mutation generations prevent stale query/refresh responses from overwriting saved data. This does not provide multi-user text editing or presence.

Inbox and the bootstrap activity snapshot retain the latest 100 records. The Activity page uses filtered, indexed server pagination over retained history. Discussions retain the latest 500 comments and 100 activity entries per task. Notification preference and Calendar DTOs are private to the current member; workspace member lists omit preferences and tokens.

## Private files

PostgreSQL stores attachment reservations and relationships; bytes live in private Vercel Blob. The browser uploads directly with a short-lived, size/type/path-bound upload token. Finalization verifies stored metadata and file signatures before exposing a ready attachment. Authorized downloads stream through the application with private/no-store, nosniff and sandbox headers. Only uploader/admin may delete. Server checks protect avatar ownership and admin-only logos; referenced image rows are locked during updates.

Files support PDF, ordinary Office OOXML, text and safe raster images, with 25 MB document / 2 MB image / 1 GB workspace limits. Cleanup retries pending/deleting records and unused profile images. No malware scanner is claimed. Local files exist only in development/disposable tests; Vercel fails closed without private storage configuration.

## Calendar and background work

Google Calendar is an optional separate per-account OAuth grant, bound to the logged-in email with single-use state, a cookie, PKCE and verified userinfo. `calendar.app.created` limits access to app-created calendars. Tokens use AES-256-GCM with account-bound authenticated data and a purpose-derived key from `BETTER_AUTH_SECRET`. Public DTOs never include tokens.

Each connection selects assigned/all tasks and reminder offsets. Private per-task inclusion/exclusion overrides that scope. Workspace policy can pause dispatch without destroying connections, and account time-zone changes enqueue synchronization of the dedicated calendar. Workers read current task/connection state, refresh credentials when needed, and upsert deterministic event IDs in a dedicated Evolve calendar. Done/archived/out-of-scope tasks remove their synced events. Disconnect stops synchronization and wipes credentials while retaining the calendar identity for reconnect. Previously copied events remain in Google.

PostgreSQL jobs use generations, SKIP LOCKED leases and retry availability. Vercel Queues wakes workers without an open browser. Duplicate queue messages are safe; stale generations cannot delete newer work. Rate limits retry; revoked grants wait for user reconnection. Daily Vercel Cron recovery requires `CRON_SECRET`; it retries missed dispatch and file cleanup. Reminders are Google Calendar events, not server webhooks or browser push.

## Runtime and operations

Next.js Node.js 24 functions and PostgreSQL/Blob run in Singapore. Queries use a small per-instance pool; LISTEN uses the provider's direct unpooled URL. Fonts/assets are bundled locally. The demo uses separate browser storage and synthetic people, with real provider connections explicitly unavailable.

Tests use disposable databases and signed fixture sessions created directly in test setup, never a production login bypass. Versioned migrations have checksums and transaction locks. They run explicitly during a controlled release, not on every build. Backups, alerting and actual provider/device delivery remain operational checks in [RELEASE.md](RELEASE.md). Rotating `BETTER_AUTH_SECRET` requires a token/session migration or reconnection plan.

Current interface and financial/administration behavior are documented in [POWER_PLANNING.md](POWER_PLANNING.md).
