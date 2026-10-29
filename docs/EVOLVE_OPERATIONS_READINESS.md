# Evolve operations readiness

25 October 2026

The administrator can open **Operations** from the shared workspace header, or visit `/workspace/operations`. This is a dashboard for current database-backed operational signals and admin-reported recovery evidence. It sends no email or webhook notifications and does not create a backup service.

## Review current conditions

1. Select **Refresh status** to read current storage, background work and maintenance state. This preserves an unsaved recovery-evidence draft.
2. Select **Run check** to execute the current aggregate database queries and persist the manual-check timestamp. This does not run cleanup, synchronize Calendar, copy files, start a backup or restore data.
3. Review active conditions. **Acknowledge current incident** records the administrator and time for the displayed set of conditions. Acknowledgment does not resolve a condition, retry a job or remove its warning. Different conditions require another acknowledgment.
4. If an update reports that Operations changed, refresh and retry. The server uses an optimistic version check; the form preserves its draft rather than overwriting another administrator action or heartbeat.

The shared document allocation remains **1 GB** on private Vercel Blob. Reserved bytes include ready, pending and deleting attachment records. Warnings begin at 80%; critical storage conditions begin at 95%. The dashboard does not copy backup contents into this allocation.

Calendar pending counts include all queued accounts. Recorded errors can indicate a retry or a required account reconnection; an error count is not a claim that every job is permanently failed. The overdue runnable signal considers enabled connections, enabled members, workspace Calendar configuration, reconnect requirements and work due for more than 24 hours. Cleanup signals count pending upload reservations older than one hour and deletion reservations older than the existing 70-minute hold. The scheduled cleanup processes a bounded batch; a backlog can remain after the handler returns successfully.

## Daily maintenance and outage coverage

The existing Vercel schedule invokes `/api/maintenance` at **02:00 UTC daily**. Its server-side `CRON_SECRET` must contain at least 32 characters. Operations shows only whether that requirement is configured; it never returns the secret. The route retains timing-safe Bearer authorization, and rejected requests cannot write a heartbeat or execute maintenance work. Secret presence does not prove the provider invoked the schedule or accepted its configuration.

The dashboard records start, completion and failure heartbeats on a best-effort basis. A missing operations table or heartbeat write failure must not prevent existing cleanup or Calendar work. Completion means the handler finished; individual cleanup and Calendar failures may still appear in their separate backlogs. A stale completion becomes overdue after **36 hours**, comprising the daily interval plus **12 hours of grace**. A new installation shows no observed completion until an authenticated run completes.

**This deployment cannot reliably detect its own full-site outage.** While Evolve, its database or its hosting environment is unavailable, this dashboard may also be unavailable. The same application cron is not independent uptime monitoring. External uptime monitoring is not configured. A missing heartbeat can be reviewed when the application is available; no unattended delivery or detection-time guarantee is provided.

## Record recovery evidence

The selected objectives are **RPO ≤24 hours** (maximum desired data-loss window) and **RTO ≤4 hours** (maximum desired time to restore). These are targets, not verified provider capabilities or recovery guarantees.

1. Obtain the actual database backup timestamp and actual private-file backup timestamp from the relevant records. Leave either empty when unknown; a task CSV export does not establish a complete database or document backup.
2. If a separate-environment recovery drill was completed, record its completion timestamp, observed restore duration and observed data-loss window in minutes. The API rejects future timestamps and measurements without a drill completion timestamp.
3. Add a reference identifying the evidence and scope. Do not enter credentials, private download links, confidential document contents or tokens. The form displays times in the administrator's device timezone and stores UTC timestamps.
4. Select **Save reported evidence**, then refresh or revisit Operations to review the persisted values. The server records the acting administrator and reporting time. Unknown timestamps and measurements remain unknown.

The dashboard compares reported backup age with 24 hours and reported drill measurements with 240 minutes to restore and 1,440 minutes of data loss. These comparisons do not independently validate the underlying records. Saving evidence cannot mark provider retention or a production restore as verified. No actual provider backup, Blob copy, retention policy, paid resource, account role or recovery automation is created by this feature.

## Separate-environment recovery procedure

Before a production recovery is considered, the owner must verify database-provider retention, recoverable timestamps, restore destination and access; identify an actual private-file backup and inventory; and agree an isolated recovery environment. If a recoverable private-file source does not exist, document that gap rather than promising file recovery.

Use a separate, approved destination. Preserve the original source. Restore the database using the provider-reviewed procedure, reconcile application schema and migration records, and compare expected record counts and representative content. Recover private files only from an actual authorized backup, then verify checksums, inventory-to-database links and private access restrictions. Avoid reconnecting OAuth jobs, queues or outbound integrations during a drill unless separately authorized. Measure the backup's data timestamp, time to a usable application, inaccessible or missing files and any unresolved differences. Record both observed data loss and restore duration, with evidence references and scope.

Production restoration, production retention changes and a new provider connection require separate explicit authorization. This runbook does not initiate them.

The existing `npx tsx scripts/verify-local-recovery.ts` checks a known local-only PostgreSQL container, dumps the disposable `evolve_e2e` fixture database, restores into a newly named disposable database, compares every public fixture table by row count and deterministic content fingerprint, and checks a synthetic local-file copy by checksum. It removes its temporary database and files. It is not a real Blob recovery test, a production restore, a production content-integrity test, a Neon retention guarantee or proof of the 24-hour/4-hour objectives. See [EVOLVE_BALANCED_UPGRADE.md](EVOLVE_BALANCED_UPGRADE.md) for its trusted-local-dump search-path requirement and recorded scope.

## Application integration

Apply additive migration `0018_operations.sql` through the repository migration process before using Operations. The singleton contains versioned JSON state and an optimistic integer version; it does not retain backup data or an unbounded event history. An absent operations table returns an Operations readiness error while the core `/api/health` contract remains unchanged. Browser/API access is restricted to the configured administrator. Operational persistence is separate from user-editable workspace settings.

## Local interface evidence

Read-only screenshots use the disposable local test workspace, not production provider status: [desktop](screenshots/operations-readiness-1440.png), [390px phone](screenshots/operations-readiness-390.png) and [320px phone](screenshots/operations-readiness-320.png). Additional read-only viewport checks found no horizontal overflow at 320, 360, 361, 375, 390, 414, 768 and 1440px.

Local drill evidence on 25 October 2026: 31 public fixture tables matched by counts and content fingerprints; synthetic file checksum matched; elapsed 949 ms. Production and actual Blob restoration remained untested.
