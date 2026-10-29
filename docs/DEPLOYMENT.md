# Vercel deployment and operations

Evolve uses Vercel project `prj_4Cvh0pTUBDKUvva5eE9GmNLFcNie` in team `jarjirjor777-5316` (`team_mF9F9Hs0sIxRfeZwh6VpBQB3`). The production origin is **https://evolve-rensist.vercel.app**; `evolve-three-plum.vercel.app` redirects there. The sole administrator is `jarjirjor777@gmail.com`, and access remains invite only.

Use [RELEASE.md](RELEASE.md) for the latest verified deployment and limitations. A Vercel `READY` build alone is not functional acceptance. Verify schema, authorization responses and a browser flow after promotion.

## Connected services

- Neon Free PostgreSQL, `evolve-db` / `store_IXt1a82xs63TrijS`, Singapore, connected to Production. Initial provider terms were accepted by the owner; do not request another installation for this existing resource.
- Private Vercel Blob, `evolve-files` / `store_cKkQdZ9Oh3mRzmUi`, Singapore. Its integration supplies `BLOB_READ_WRITE_TOKEN`. A live put/private-get/delete smoke succeeded and anonymous file access returned 403.
- Vercel Queues topic `evolve-calendar`, with a private `queue/v2beta` trigger on `/api/queues/calendar`. PostgreSQL holds durable jobs; Queues supplies wakeups. The integration is not considered live Google verification until an actual account authorizes Calendar.
- Daily Vercel Cron `/api/maintenance` at `0 2 * * *` UTC (09:00 WIB) recovers missed queue dispatch and stale files. `CRON_SECRET` authenticates it; public calls are rejected. Normal task synchronization is event driven rather than waiting for this recovery schedule.

No paid plan was activated. Hobby/Free operation, transfer, storage and compute quotas still apply. The application caps documents at 25 MB each, images at 2 MB and workspace files at 1 GB, but provider quotas also include operations and transfer.

## Secure variables

Set values through [Vercel environment settings](https://vercel.com/jarjirjor777-5316/evolve/settings/environment-variables), separately for each environment. Never paste credentials into chat or commit them.

| Variable                                              | Purpose                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | Managed pooled PostgreSQL URL with verified TLS                             |
| `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` | Direct PostgreSQL connection for LISTEN/NOTIFY                              |
| `BETTER_AUTH_URL`                                     | `https://evolve-rensist.vercel.app` in Production                           |
| `BETTER_AUTH_SECRET`                                  | At least 32 random characters; session and Calendar encryption key material |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`            | Existing Google OAuth Web client                                            |
| `ADMIN_EMAIL`                                         | `jarjirjor777@gmail.com`                                                    |
| `BLOB_READ_WRITE_TOKEN`                               | Private Blob store integration token                                        |
| `CRON_SECRET`                                         | Random server-side secret, at least 32 characters                           |

Never enable local database/files/test fixture switches on Vercel. Local `.env.local`, `.data` and `.vercel` are ignored. The demo does not require organization credentials. A real backend Preview requires a separate database and matching auth origin/OAuth callbacks; do not point it at Production just to make a review link work. Preview protection is retained.

## Google configuration

For login, preserve the Web client origin `https://evolve-rensist.vercel.app` and callback:

```text
https://evolve-rensist.vercel.app/api/auth/callback/google
```

For the optional Calendar integration, enable Google Calendar API in that same project and add:

```text
https://evolve-rensist.vercel.app/api/calendar/callback
```

Follow [the Indonesian step-by-step tutorial](GOOGLE_CALENDAR_SETUP.md) for exact console navigation, test users, consent and reminders. Every member grants Calendar access separately to their own account. An admin cannot connect someone else's calendar. Testing-mode grants can expire after seven days; complete Google's publication/verification requirements for routine use. Preserve login scopes and the existing callback when adding Calendar.

## Controlled release

1. Run the repository's quality checks against disposable databases. Keep the current production deployment ID and verify the intended source.
2. Review additive migrations and the provider's recovery policy. Never seed fixtures or reset Production. The migration runner takes transaction advisory locks, records hashes, rejects changed applied migrations, and applies each migration atomically.
3. Apply migrations explicitly using the intended secure environment. Ordinary builds use `npm run build`, without automatic schema changes.
4. If cloud TCP access to Neon is unavailable, use a controlled Vercel release build with the **deployment's uploaded `vercel.json`** `buildCommand` temporarily set to `npm run db:migrate && npm run build`. A `projectSettings.buildCommand` API override alone is insufficient when `vercel.json` defines its own command. Verify `Applied:` / `Already applied:` logs for all migrations before declaring success. Keep the repository's ordinary build command unchanged, and restore the Vercel project build setting afterward.
5. Build the final application with the ordinary command. If traffic is held on a rollback deployment, explicitly promote the intended READY deployment with Vercel's documented promotion API/dashboard. Check the custom domain mapping rather than assuming aliases moved.
6. Verify `/api/health` returns 200 with `schema: current`, `/` and `/demo` load, and anonymous task/workspace/calendar/file/event requests return 401. Confirm forged mutation origins fail. Open a real browser and exercise the demo without touching organization data.
7. Complete actual owner/teammate Google login and private CRUD, file and Calendar checks using authorized accounts. Never manufacture Production sessions or add a login bypass to simulate this.

In this managed cloud environment, Vercel authentication is supplied through the `VERCEL_TOKEN` proxy on `api.vercel.com`. Use the supported HTTPS route without printing, extracting or writing proxy credentials. The CLI may reject placeholder format; that alone does not imply missing account access. For provider SDK network checks, Node's supported `NODE_USE_ENV_PROXY=1` respects the inherited proxy. Keep TLS verification enabled.

## Rollback and recovery

Keep the previous READY production deployment available as a reference. Once grouped Cost data is written, recovery must use an application that retains the options-aware compatibility guard/projection and Calendar/private-file deletion recovery. An older monetary writer can make grouped data inconsistent, even though the columns are additive. Prefer fixing forward. Verify the custom domain and endpoints after any approved recovery deployment. Do not reverse applied migrations by editing files, truncate data, or restore a database as an automatic application rollback.

Confirm Neon recovery/retention and test restoration in a separate environment before relying on a specific recovery objective. Provider backup policy and production external alerting remain unverified until recorded in release evidence. `/api/health` checks database schema and auth configuration, but does not prove real Google consent, Calendar/device delivery or all user journeys.

Monitor Vercel function errors/latency, database saturation, queue retry counts, OAuth reconnect errors and storage usage. Calendar status exposes sanitized errors and pending count to its owner. Rotate secrets deliberately: changing `BETTER_AUTH_SECRET` invalidates sessions and affects stored OAuth token decryption, so plan reconnection/key migration first.

### Local recovery rehearsal

`npx tsx scripts/verify-local-recovery.ts` restores the disposable test database in the known local-only Docker container and checks a synthetic file checksum. The drill creates and removes its own uniquely named database; it never targets production. Existing project CHECK helpers need `pg_catalog, public` available during restore, because their function bodies resolve sibling public helpers at runtime. The script handles that in trusted dump SQL. See [balanced upgrade evidence](EVOLVE_BALANCED_UPGRADE.md#recovery-exercise). This verifies local recovery mechanics, not Neon retention or private Blob restoration.
