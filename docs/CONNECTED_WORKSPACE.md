# Connected Evolve workspace

Published 26 October 2026 at [Evolve](https://evolve-rensist.vercel.app). Application source `d747d8f`; deployment `dpl_FfuBkq32eYMpSxGNnjdR4LkBgQmz`. Migrations 0021–0037 and the separately verified canonical transition are active. Five former Locker projects and seven tasks were preserved in the read-only archive. Existing external Calendar events were retained; production attachments were absent. See [release evidence](audits/connected-workspace-2026-10-26/production-release.json).

## Product model

Board Room owns project identity. Each project can have many assets and Locker Room tasks; tasks never belong to assets. Assets have one immutable, unique RUPTL code and at most one project. Project capacity and asset totals are separate, grouped by unit. Stage position and completed tasks do not measure physical completion.

Board Room contains the project command centre (Overview, Assets, Tasks, Documents, Activity), Assets database/import workbench, Data quality, Project → Asset connections and saved meeting packs. Locker uses canonical projects after the controlled transition. Archived Locker work has a separate read-only browser, including original links, private documents, comments, activity and historical expenses.

## Native workflows

- Assets: members browse; admins create/edit, explicitly reassign and import. The template and example are under `public/board-room/`; the shared field guide is in [BOARD_ROOM_CSV.md](BOARD_ROOM_CSV.md). Import preview preserves blank existing values, makes clearing explicit, requires assignment confirmation, rejects stale previews and commits atomically. Retried confirmations cannot change the original payload.
- Canonical project CSV identifies projects by **Project ID** (UUID); linked asset codes occupy **Asset RUPTL codes**. New rows may omit Project ID. Explicit Legacy CSV mode keeps former code-based import compatibility. The request budget remains 4 MiB encoded JSON; oversized inputs must be split.
- Documents: purpose dropdown, private view/download, cancellable/retryable uploads, confirmed removal and version history share one layout. A verified replacement becomes current atomically. Retried replacement preparation reuses one storage allocation; changed payloads cannot reuse a request ID. Failed/stale uploads keep existing evidence. Admins restore versions and remove history; retained, pending and deleting bytes use the shared 1 GB quota. Provider cleanup must succeed before capacity is released. Current ZIP downloads omit history unless an admin includes it.
- Shared changes refresh related views through authenticated events and authorized fetches, with reconnect/tab-return refresh and a 45-second visible-tab fallback. Forms keep their local values; writes reject stale versions.
- Drafts: account/form/record scoped text and selections expire after seven days on the same browser. Restore is explicit and preserves the original record version. File bodies and credentials are never stored. Existing task edits are recoverable. Explicit discard/save/logout clears drafts. Closing quickly flushes the debounce. Old drafts without a base version cannot overwrite an existing record.
- Search covers names, identifiers, RUPTL codes, task titles and current document filenames. Private draft files and legacy records are excluded; archive search is separate. Saved views, room URLs, pinned projects and recent records preserve context.
- Meeting packs store immutable structured snapshots, authorship and decisions. Corrections create linked revisions; existing follow-up task IDs remain linked without duplicate tasks. Current task status is displayed separately from the snapshot. Print/save PDF does not duplicate file binaries.
- Home shows assigned work, overdue work, meeting follow-up, notifications and admin document-review requests. Reading a notification never completes a task.

## Schema and cutover

Apply additive migrations **0021–0037 in order** through the existing migration runner. Do not edit applied migration files. Health requires migration 0037, assets, meeting records and document-version columns.

Asset migration copies each existing Board project’s technical information into one connected asset. Board IDs, evidence, history and review state remain. Historical Scope/checklist values stay stored but are absent from active forms, filters and reports.

Canonical Locker activation is a separate, deliberate admin operation; deploying schema alone does not archive live work:

1. Verify recoverable database and actual file-content backups in an isolated restore target. Record evidence and capture pre-cutover counts. Drain Calendar worker leases and pause other writers.
2. Request the admin-only `GET /api/workspace/transition` preview. It includes counts and a signature of source rows.
3. Submit `POST /api/workspace/transition` with the preview `token` and concrete `recoveryEvidence`. Same-origin/authentication checks apply. A stale signature rejects activation.
4. Activation takes a write barrier, reconciles immutable archive counts, retains attachment bytes and existing external Calendar events, then enables Board identity and its database-maintained Locker projection. Old jobs, recurrence and notifications leave active tables. No future legacy Calendar synchronization is scheduled.
5. Verify canonical task creation, archive links, document access, integrity counts and worker health before reopening writes. Production smoke checks must not create synthetic project files.

The database-maintained Locker projection uses the Board UUID to retain task foreign keys and existing task functionality. Independent project/cost mutations are rejected once connected mode is enabled.

## Recovery method and limits

The disposable rehearsal applies every migration to a clean database, preserves post-cutover active Board records/projections/tasks, restores archived project/task rows, copies real private local file bytes and verifies readback and original IDs. This proves the local recovery algorithm, including retention of new Board-linked tasks. A separate managed-provider rehearsal restored all 32 production source tables with matching fingerprints in 73.347 seconds, then migrated and archived the isolated copy. Source documents were absent; private Blob upload/replacement/history/download/provider deletion were separately exercised with isolated synthetic files. This is a one-time recovery observation, not an automated daily-backup or ongoing RPO/RTO guarantee.

For an emergency rollback, retain a full consistent post-cutover database/file snapshot first. Restore into an isolated target with connected mode disabled; preserve active Board identities, projections and new task-related rows before restoring legacy rows in foreign-key order. Restore document metadata together with its actual file content, then reconcile counts, IDs, relationships, private reads and quota. Review the isolated result before routing traffic. Do not simply replace the live database with an old backup: that would discard post-cutover work. Do not delete immutable archive records to roll back.

Archived ready attachments are excluded from cleanup selection. They stay read-only and continue to consume quota. Pending/deleting unarchived uploads remain eligible for cleanup. Current-document deletion clears its logical pointer atomically so an upload started against the deleted version cannot resurrect it.

## Verification and release gates

See [verification evidence](audits/connected-workspace-2026-10-26/README.md). Local fixtures and their authentication data are ignored by git. Scale preparation is restricted to localhost and the disposable database `evolve_connected_perf`.

Before production promotion: all regression/static/build gates must pass; rehearse against a production-equivalent isolated database and actual provider backups; reconcile migration/archive/file integrity; verify the exact held build; resolve the dependency advisory or obtain a fresh, explicitly documented release decision. The previous release’s exception does not authorize this release.

The release audit reports zero known vulnerabilities. A scoped override upgrades `@vercel/cli-config`’s Zod dependency from 4.1.11 to 4.6.7 within the same major; actual generated Vercel schemas and oversized constrained-array rejection have regression tests. No prior dependency exception was reused.

## Retained release recovery evidence

The isolated managed database `evolve_preview_07a2fcc065d242ab` retains the encrypted original snapshot in `release_recovery_evidence`. The encryption key is retained as the production-only encrypted Vercel variable `EVOLVE_RELEASE_RECOVERY_KEY`; do not rotate it without re-encrypting retained evidence. The encrypted local copy is ignored by git at `.vercel/connected-recovery.bin`; its SHA-256 is in the release evidence. Neither plaintext backups nor authentication data are committed.

Temporary preview and artifact deployments, review sessions and temporary environment variables were removed after verification. The isolated database remains for recovery evidence. Restoration must use a separate target, verify original fingerprints, preserve post-cutover work, and reconcile before routing traffic. The one-off release tools are project/environment guarded; use the ordinary migration runner for routine migrations.

Deleting a newly uploaded file removes provider bytes immediately when successful but retains the reservation until its upload-token safety window expires. Pending/deleting bytes remain allocated during that window. Cloud verification confirmed six synthetic objects absent from Blob, then expired the hold only in the disposable fixture and verified zero allocated bytes. Production files were not created or deleted during these checks.
