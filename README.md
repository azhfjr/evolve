# Evolve

**One connected workspace for project monitoring and day-to-day delivery.** Evolve contains Board Room and Locker Room, sharing authentication, project identity, documents, appearance settings and storage.

- **Website:** https://evolve-rensist.vercel.app
- **GitHub:** https://github.com/azhfjr/evolve
- **Documentation updated:** 29 October 2026 (Asia/Singapore)

## Repository and publication status

The existing Vercel project **evolve** is connected to this repository, with **main** as its production branch. Git-triggered builds are enabled. Automatic production-domain assignment is held so a verified demo can be shared before publication.

The application source, migrations, tests and documentation are synchronized to this repository. Earlier application releases were deployed directly from the development workspace; this source synchronization establishes the Git-based development baseline without publishing a new production release. See the [cloud workspace setup guide](docs/CLOUD_WORKSPACE_SETUP.md) for repeatable onboarding.

The latest recorded application release uses source `c0f13a1`, deployment `dpl_8KJ3XVDmvmy3ESV2ZRDo3u6MjfJz`. Documentation commits are not application releases. Older dated verification records describe their own release, not necessarily the current website.

## How the two applications work together

```text
Board Room project
├── Assets: technical records identified by unique RUPTL codes
├── Locker Room tasks: assigned work, subtasks and dependencies
├── Documents: private evidence and retained revisions
└── Activity: project changes and review history
```

Board Room owns canonical projects. Locker Room uses those projects when creating and organizing tasks. Tasks belong to projects, never directly to assets. An asset may be unassigned or linked to one project; a project may have many assets.

### Board Room — Kalimantan - Power System Projects

Board Room monitors a portfolio through ten administrator-defined stages and yearly planning. Its Overview excludes task metrics so project monitoring remains distinct from work management.

- Search, shared filters, saved views and yearly counts split into **Pembangkit**, **Transmisi** and **Gardu Induk**.
- Portfolio timeline with a table alternative; project, linked-asset and evidence-review summaries beneath it.
- Document-readiness stacked columns, project-category pie chart, asset-coverage donut, asset-category/location bars and capacity-by-year columns, with accessible tables and scoped exploration.
- Kalimantan province map and a separate project–asset connection map.
- Project detail tabs for overview, assets, tasks, documents and activity; project-aware task creation opens the connected workflow.
- Admin-managed assets with unique RUPTL codes, names, primary category, capacity/unit, location, voltage and optional project assignment.
- CSV templates, examples, preview/merge workflows, conflict detection and explicit asset reassignment. Absent records are preserved; import is not a portfolio replacement operation.
- Data-quality review for incomplete or inconsistent records, unassigned assets and project-versus-asset figure differences.
- Multiple custom-category assignments, project links and private project documents.
- Administrator-controlled stages and document validity. Uploading evidence does not automatically make a project valid.

Project capacity and asset capacity are independent. Totals are grouped by unit; MW, MVA, kms, MWh, MWp, MWac and custom units must not be combined. Stage position and completed tasks are not physical-completion percentages. Planning uses years rather than invented project dates.

### Locker Room — task management

Locker Room organizes delivery work against Board Room projects:

- Searchable project selection, task creation/editing, assignments, status, priority, labels, descriptions and checklists.
- List, board and calendar views with search, filters, sorting and pagination.
- Subtasks inherit the parent project. Dependencies are validated to prevent invalid relationships and cycles.
- Comments, private attachments, task templates and recurrence.
- Personal action centre and notifications; reading a notification does not complete its underlying task.
- Optional per-account, one-way Google Calendar integration with durable dispatch and recovery.
- Former independent Locker projects/tasks remain available through a separate read-only archive. They are excluded from active work, recurrence and new Calendar synchronization; existing external events are retained.

Independent Locker project creation and historical expense tools are not the active canonical-project workflow. Historical documentation may describe the earlier design.

### Shared workspace

- Google sign-in, invited membership, one configured administrator and server-enforced permissions.
- App chooser, room switching, account preferences, light/dark themes, sidebar preferences and shared branding.
- Unified search across authorized project, asset, task and current-document metadata; archive search is separate.
- Live refresh through authenticated events, reconnect/tab-return refresh and a visible-tab fallback. Edits use version checks to reject conflicting writes while preserving local input.
- Explicit same-browser draft recovery for project, asset and task forms. Drafts are scoped to account/form/record, expire after seven days, and do not retain file bodies or credentials. Logout invalidates pending draft writes.
- Shared Files inventory, private document access and administrator storage management.

## Documents and storage

Projects can be created or imported without documents. Both apps expose their existing project upload capability; Board uploads remain administrator-only, while Locker retains its member-upload and owner/admin-deletion rules.

Each attachment has at most one purpose label: **Reference, Meeting Notes, KKP, KKO, KKF, Simulation Files or Other**. Existing documents may remain unlabelled. Uploads support progress, cancellation and retry; successful replacements become current only after completion. Historical versions remain until an administrator removes them.

- Preserve supported file types and the **25 MB document limit**.
- View/download individual authorized files or download a project's files as ZIP. Locker project downloads include associated task attachments.
- Administrators can download workspace documents together. Current versions are the default; history is an explicit admin option.
- Successful changes to Board evidence require renewed review; failed replacements preserve existing evidence.
- The **1 GB allowance is shared**, not one cap per application. Files shows Locker, Board and shared-assets usage against the same pool.
- Pending uploads, retained revisions and files awaiting cleanup count toward allocated storage. Deletion releases capacity after cleanup and applicable safety holds succeed.

## Kalimantan map and data integrity

The regional map uses actual polygons for West, Central, South, East and North Kalimantan. It aggregates distinct project IDs under the active filters, normalizes recognized location names, and separates unassigned/unrecognized locations so they do not silently inflate regional counts. Regional selections drill into the matching project scope.

Geometry comes from **geoBoundaries gbOpen IDN ADM1**, revision `9469f09`, boundary year 2017. Attribution: © OpenStreetMap contributors; distributed by geoBoundaries, source OpenStreetMap / Wambacher. The five province geometries are extracted without coordinate simplification. Boundaries represent that source vintage, not a guarantee of current administrative surveying.

- [Boundary source](https://github.com/wmgeolab/geoBoundaries/tree/9469f09/releaseData/gbOpen/IDN/ADM1)
- [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

## Technology and application structure

| Area           | Implementation                                                        |
| -------------- | --------------------------------------------------------------------- |
| Runtime        | Node.js 24, npm                                                       |
| Application    | Next.js 16 App Router, React 19, strict TypeScript                    |
| Data           | PostgreSQL, Drizzle ORM, ordered SQL migrations                       |
| Local fallback | PGlite for development only                                           |
| Authentication | Better Auth with Google OAuth                                         |
| Files          | Private Vercel Blob; authorized application endpoints                 |
| Interface      | Shared CSS tokens, Radix controls, Lucide icons, SVG visualizations   |
| Delivery       | Vercel, Singapore region, maintenance cron and Calendar queue workers |
| Tests          | Node/tsx domain tests, Playwright, axe accessibility checks           |

In the full source checkout, `src/app` contains routes/API handlers and shared styles; `src/components` contains interface components; `src/lib` contains domain/data/integration code; `migrations` contains schema changes; `scripts` contains setup and verification tools; `tests` contains automated checks; `public/board-room` contains production CSV templates; and `docs` contains specifications, audits and release records. Consult `package.json` for exact dependency versions.

### Main routes

| Route                       | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `/`                         | Sign-in/landing                          |
| `/workspace`                | Authenticated app chooser                |
| `/board-room`               | Board Room portfolio and workspaces      |
| `/board-room/projects/[id]` | Project command centre                   |
| `/app`                      | Locker Room                              |
| `/workspace/settings`       | Shared settings, including Files         |
| `/workspace/templates`      | Shared template directory                |
| `/workspace/operations`     | Authorized operational controls/evidence |
| `/workspace/archive`        | Read-only legacy work                    |
| `/demo`                     | Separate browser-only demonstration      |

Navigation sections within a room may use query parameters rather than separate page paths. Server authorization applies independently of menu visibility.

## Development setup

Prerequisites: Node.js 24, npm, and preferably local PostgreSQL 17. Docker is optional for the local database helper.

```sh
npm ci
cp .env.example .env.local
# Configure local values securely before running the application.
npm run db:local
npm run dev
```

`db:local` provisions local PostgreSQL with generated credentials in ignored `.env.local`, bound to `127.0.0.1:54329`, while preserving existing configuration. Restart its existing container with `docker start evolve-development-db`; do not delete its data volume to troubleshoot startup.

Without `DATABASE_URL`, supported local development can use PGlite under `.data/postgres`. Apply migrations with `npm run db:migrate`. Embedded/local-file storage must not be enabled on Vercel. `npm run dev` runs the migration pre-hook before starting Next.js.

### Environment configuration

Use `.env.example` from the full checkout as the variable-name reference. Never commit populated environment files, tokens, cookies, database URLs, OAuth credentials, private backups or `.vercel` authentication artifacts.

| Variable                                    | Purpose                                                 |
| ------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                      | Public display name                                     |
| `BETTER_AUTH_URL`                           | Trusted application origin for authentication           |
| `BETTER_AUTH_SECRET`                        | Server-side authentication secret                       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`  | Google OAuth application credentials                    |
| `ADMIN_EMAIL`                               | Configured sole administrator identity                  |
| `DATABASE_URL`                              | Managed PostgreSQL query connection in production       |
| `DATABASE_URL_UNPOOLED`                     | Direct connection for LISTEN/NOTIFY                     |
| `BLOB_READ_WRITE_TOKEN`                     | Private Vercel Blob access                              |
| `CRON_SECRET`                               | Authorized maintenance/recovery execution               |
| `EVOLVE_LOCAL_DATABASE`, `EVOLVE_FILES_DIR` | Local development only; not production storage settings |
| `EVOLVE_DISABLE_TASK_DRAFT_UPLOADS`         | Operational pause for new draft uploads                 |

Google login requires real OAuth credentials and matching authorized redirect configuration. Calendar consent is separate and optional. Manage production secrets through secure Vercel settings; do not paste them into issues or README files.

## Verification commands and safety

Run from the full application checkout:

```sh
npm run test:db:prepare
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=moderate
npm run build
```

`test:db:prepare` only provisions the guarded localhost databases `evolve_test` and `evolve_e2e`. Database/browser tests reset disposable fixtures, so never redirect them to real customer data. Managed test targets require explicit `EVOLVE_TEST_DATABASE_URL` and `EVOLVE_E2E_DATABASE_URL` with the expected disposable database names and applied migrations.

Playwright builds/starts isolated production-mode servers. Install required browsers/system libraries first. For environments without `/usr/bin/chromium`, use the configured `PLAYWRIGHT_CHROMIUM_EXECUTABLE` or installed Playwright browser configuration. Run browser suites sequentially when they share `.next`.

Additional checks:

```sh
npm run quality:cross
npm run quality:scale
npx tsx scripts/prepare-connected-scale.ts
npx playwright test --config playwright.connected-scale.config.ts
```

`quality:scale` uses its guarded localhost `evolve_perf` fixture. Canonical connected scale uses `evolve_connected_perf`, with 1,000 projects, 10,000 assets and 20,000 tasks. These are disposable performance fixtures, not production load generators. Local p95 targets do not establish a production SLA.

The full checkout's GitHub Quality workflow defines static/domain/Chromium checks, Firefox/WebKit journeys, feature-suite matrices and scale jobs. The workflow is included in `.github/workflows/quality.yml`; check GitHub Actions for actual remote run outcomes.

### Recorded results, not freshly rerun claims

For the EA-001–EA-010 application release: 350 domain/integration tests, 26 final affected Chromium/Firefox checks, 56 broader Chromium checks and canonical scale verification passed. Type checking, lint, formatting and production build passed. Thirty held and thirty public health/route/access checks passed, with 16 hashed assets matching the tested build. The release dependency audit reported zero advisories at that time.

Limits: WebKit execution was blocked by a missing host library; remote CI was not run; Vercel runtime-log access returned 403. Signed-in production mutations were not exercised. Browser fixture sessions do not prove a real Google consent exchange. Dependency status must be checked again for every release. This documentation change does not claim to rerun those application tests.

## Release, preview and recovery policy

1. Synchronize the intended reviewed source to GitHub; verify team, project, branch and exact commit.
2. Check required environment variables without disclosing their values.
3. Run relevant tests, dependency audit and production build. Resolve release-blocking findings.
4. Prepare, verify and **share a working demo/preview before publishing**. Git connection is not release approval.
5. Stage a production-environment build without assigning live domains; verify that exact build. A preview rebuilt with production variables is a different build.
6. Promote only after the demo and release requirements are satisfied. Check health, access boundaries, routes and assets without creating synthetic records/files in live projects.
7. Retain a known-good rollback deployment, revoke temporary review access and record actual results/limits.

Schema changes require recoverable database and actual file-content evidence. Rehearse migrations/restoration in an isolated target. A deployment rollback does not reverse a database migration. Recovery must preserve newly created Board-linked tasks, project IDs, private evidence, history and shared quota accounting. One successful restoration rehearsal is not proof of automatic daily backups or guaranteed RPO/RTO.

## Documentation available here

- [Historical standalone Board Room mockup](docs/mockups/board-room/README.md): browser-local prototype, not the authenticated application.
- [Connected-workspace historical verification](docs/audits/connected-workspace-2026-10-26/README.md): dated release evidence and limits.

Detailed companion guides, screenshots, source files and machine-readable audit artifacts are included in this repository. Historical feature proposals are not proof that a feature is active. Meeting-pack creation was retired from active navigation; retained historical meeting records and existing follow-up tasks must not be deleted as documentation cleanup.

## Security and contribution expectations

Use disposable data for development and testing. Preserve server-side role checks, private endpoints, origin validation, optimistic concurrency, archive boundaries and quota enforcement. Never commit credentials or production exports. Keep application changes focused, add regression coverage for confirmed defects and document verification limits honestly.

No general open-source license grant is added by this README. Third-party fonts, dependencies and geographic data retain their own licenses and attribution requirements.
